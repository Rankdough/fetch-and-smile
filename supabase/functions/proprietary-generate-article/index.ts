// Proprietary Mode — full-article orchestrator (demo path).
//
// Shortest end-to-end pipeline that calls the proprietary engine on every
// section. No mapping UI required: this function auto-picks the best brain
// unit per section by deterministic token overlap.
//
// Pipeline:
//   1. Load every brain_insights row for the project (capped).
//   2. AI call: derive 3 H2 question headings for the topic.
//   3. Build outline: opening (framing) → TL;DR (framing) → 3 H2s (body) →
//      failure-mode (body, healthcare/service only) → final thoughts (framing).
//   4. For each section, auto-pick the highest-overlap unit (or null).
//   5. Series-call section generator, threading surroundingContext.
//   6. Stitch markdown and return alongside per-section telemetry.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  assembleSectionPrompt,
  buildContradictionPrompt,
  lintRule5,
  type BusinessType,
  type MappedUnit,
  type SectionSpec,
  type UnitType,
} from "../_shared/proprietaryPromptAssembler.ts";
import { NON_COMMODITY_TITLE_RULES, isCommodityStyleTitle } from "../_shared/nonCommodityTitleRules.ts";
import { countWords, trimSectionToBudget } from "../_shared/articleSectionBudget.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const CLINICAL_MODEL = "claude-sonnet-4-20250514";

interface RequestBody {
  topic: string;
  length?: "short" | "medium" | "medium-long" | "long" | "extended" | "comprehensive";
  wordCount?: number;
  audienceSentence?: string;
  businessType?: BusinessType;
  publicationDestination?: "ai-search" | "human-blog" | "both";
  model?: string;
}

interface BrainUnit {
  id: string;
  title: string | null;
  summary: string | null;
  full_text: string | null;
  unit_type: UnitType | "legacy" | null;
}

async function callModelRaw(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
): Promise<{ content: string; finishReason: string }> {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limit exceeded — try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted — top up the workspace.");
    throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return {
    content: json?.choices?.[0]?.message?.content ?? "",
    finishReason: json?.choices?.[0]?.finish_reason ?? "stop",
  };
}

async function callModel(system: string, user: string, model: string, maxTokens = 1200): Promise<string> {
  const first = await callModelRaw(system, user, model, maxTokens);
  let content = first.content;
  // If hit length cap, ask for continuation and stitch.
  if (first.finishReason === "length") {
    console.warn(`PROPRIETARY: hit max_tokens (${maxTokens}); requesting continuation`);
    const contSys = system + "\n\nYou are continuing a partial response. Output ONLY the remaining text, starting at the exact point the previous response stopped. No restating, no preamble.";
    const contUser = `${user}\n\n--- PARTIAL RESPONSE SO FAR (continue from the exact next character) ---\n${content}`;
    try {
      const second = await callModelRaw(contSys, contUser, model, maxTokens);
      // Join with no separator; trim leading whitespace from continuation.
      content = content.replace(/\s+$/, "") + (content.endsWith(" ") ? "" : " ") + second.content.replace(/^\s+/, "");
    } catch (e) {
      console.warn("PROPRIETARY: continuation failed (non-fatal):", e);
    }
  }
  // Strip any trailing dangling-incomplete sentence (no terminator) as a last-resort guard.
  const trimmed = content.trim();
  const lastTerm = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
  if (lastTerm > 0 && lastTerm < trimmed.length - 1) {
    const tail = trimmed.slice(lastTerm + 1).trim();
    // Drop if tail looks like an incomplete sentence (no terminator, > 0 chars, not just markdown).
    if (tail.length > 0 && !/[.!?]$/.test(tail) && !/^[#*\-|]/.test(tail)) {
      return trimmed.slice(0, lastTerm + 1);
    }
  }
  return content;
}

const CLINICAL_SYSTEM_PROMPT_HEALTHCARE = `You are a clinical content writer producing non-commodity dental and medical content for a specific audience. Your purpose is to write the way an experienced clinician would answer — with specific, honest, experience-backed content that goes beyond what any generic website or AI tool would produce.

You follow these rules strictly:

RULE 1 — NO COMMODITY ANSWERS
Never write anything that could appear on any generic dental or medical website. No "consult your dentist," no "results vary," no generic timelines without context. If the knowledge input does not contain specific clinical detail on something, write [NEEDS EXPERT INPUT] rather than generating a plausible-sounding generic answer.

RULE 2 — LEAD WITH THE HONEST ANSWER
State the direct answer first. Then explain the clinical reasoning. Then give the honest tradeoff or limitation. Never bury the real answer in qualifications.

RULE 3 — DISTINGUISH DENTAL VS SKELETAL, SIMPLE VS COMPLEX
For every condition or treatment question, first establish which category the case falls into before giving a recommendation. The category determines everything else.

RULE 4 — INCLUDE FAILURE MODES
For every body section, include what goes wrong when the treatment is done incorrectly or on the wrong candidate. Use explicit language: "the common failure is", "what goes wrong when", "this fails when". This is the information patients need most and find least on the internet. Never omit it.

RULE 5 — SPECIFIC NUMBERS OVER RANGES
When giving timelines, costs, or success rates, give specific numbers. If a range is genuinely necessary, explain what drives each end of the range. Never write "varies", "depends on", "typically", or "usually" without a specific number in the same sentence. If no number exists in the knowledge input, write "No published figure on this — ask the clinical team directly."

RULE 6 — CONTRADICT CONVENTIONAL WISDOM WHEN EXPERIENCE WARRANTS IT
If the knowledge input contains evidence that contradicts what most websites say, say so directly. Use the pattern: "Most websites say X. In practice, Y because Z." Never confirm conventional wisdom when the knowledge input contradicts it.

RULE 7 — NEVER FABRICATE QUOTES
Never include a quoted statement unless the exact quote text and its attributed named source are explicitly present in the knowledge input. If no attributed quote exists in the input, write no quote at all. A missing quote is better than a fabricated one.

RULE 8 — TOPIC-SPECIFIC TABLES ONLY
If a comparison table is appropriate for this section, derive the column headers directly from the clinical topic. Never use generic columns like Option A, Option B, Option C, Best for Beginners, Intermediate Users, or Advanced Needs. Table columns must be clinically meaningful for the specific topic.

STRUCTURE FOR EVERY BODY SECTION:
- Direct answer or direct claim (first sentence — no preamble)
- Clinical explanation (what is actually happening and why)
- Who is and is not a good candidate (when relevant)
- What to expect specifically (timeline, process, outcome with real numbers)
- Honest failure mode or limitation (mandatory — use explicit failure language)
- Bottom line (one sentence the reader can act on)

You are writing content for patients to arrive at their clinical consultation already informed, with the right questions prepared. You are not a replacement for clinical consultation.`;

function buildClinicalUserMessage(input: {
  mappedUnit: MappedUnit | null;
  audienceSentence: string;
  publicationDestination: "ai-search" | "human-blog" | "both";
  section: SectionSpec;
  articleTitle: string;
}): string {
  const knowledgeInput = input.mappedUnit?.full_text?.trim()
    ? input.mappedUnit.full_text.trim()
    : "No proprietary knowledge unit available for this section — generate from clinical expertise following all rules, use [NEEDS EXPERT INPUT] only where a specific proprietary number or case detail is required.";

  return [
    `Topic: ${input.articleTitle}`,
    `Section heading: ${input.section.heading}`,
    `Section type: ${input.section.kind}`,
    `Audience: ${input.audienceSentence}`,
    `Publication destination: ${input.publicationDestination}`,
    `Knowledge input: ${knowledgeInput}`,
    "",
    "Write this section now.",
  ].join("\n");
}

async function callAnthropic(system: string, user: string, maxTokens = 1400): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CLINICAL_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return ((json?.content ?? []) as Array<{ type?: string; text?: string }>)
    .filter((c) => c?.type === "text")
    .map((c) => c.text || "")
    .join("");
}

/* ── outline generation ───────────────────────────────────────────────── */

async function generateH2Questions(topic: string, model: string): Promise<string[]> {
  const sys = `You generate H2 question headings for non-commodity articles. Output exactly 3 question headings, one per line, no numbering, no bullets, no markdown. Each must be a real question a reader would type, phrased in 4-10 words. No filler openers. No "what is X" if there's a sharper question.`;
  const user = `Topic: ${topic}\n\nReturn 3 H2 question headings.`;
  const raw = await callModel(sys, user, model, 400);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\d\-*.\s)#]+/, "").trim())
    .filter((l) => l.length > 5 && l.length < 140);
  return lines.slice(0, 3);
}

/* ── non-commodity title rewrite ──────────────────────────────────────── */

async function rewriteTitleNonCommodity(
  rawTitle: string,
  model: string,
): Promise<string> {
  if (!isCommodityStyleTitle(rawTitle)) {
    console.log(`TITLE REWRITE: input "${rawTitle}" already non-commodity, kept as-is`);
    return rawTitle;
  }
  const sys = `You rewrite article titles to be non-commodity per the rules below. Return ONLY the rewritten title as a single line. No quotes, no explanation, no markdown.\n\n${NON_COMMODITY_TITLE_RULES}`;
  const user = `Original title: ${rawTitle}\n\nRewrite per the rules. Pick the strongest framing (distinction, decision, failure mode, or contrarian) for this topic. Keep the primary keyword visible but reframed. Return only the new title.`;
  try {
    const raw = (await callModel(sys, user, model, 200)).trim();
    // Strip surrounding quotes / markdown / leading "#" if model added any.
    const cleaned = raw
      .replace(/^#+\s*/, "")
      .replace(/^["'“”']|["'“”']$/g, "")
      .split(/\r?\n/)[0]
      .trim();
    if (cleaned.length < 6 || cleaned.length > 160) {
      console.warn(`TITLE REWRITE: model returned out-of-range length (${cleaned.length}), keeping original`);
      return rawTitle;
    }
    console.log(`TITLE REWRITE: "${rawTitle}" -> "${cleaned}"`);
    return cleaned;
  } catch (e) {
    console.warn("TITLE REWRITE failed (non-fatal):", e);
    return rawTitle;
  }
}


/* ── deterministic unit auto-mapping ──────────────────────────────────── */

const STOPWORDS = new Set([
  "the","and","for","with","that","this","from","have","been","were","when","what",
  "which","their","there","about","into","over","than","then","they","them","your",
  "you","are","was","but","not","can","does","how","why","who","whom","one","two",
  "use","using","used","also","its","it's","more","most","some","any","all","will",
  "should","could","would","may","might","much","many","very","just","like","such",
  "make","made","take","gets","get","got","need","needs","needed",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
  );
}

function pickUnit(
  sectionHeading: string,
  topic: string,
  units: BrainUnit[],
  minOverlap = 2,
): MappedUnit | null {
  if (!units.length) return null;
  const target = tokenize(`${topic} ${sectionHeading}`);
  let best: { unit: BrainUnit; score: number } | null = null;
  for (const u of units) {
    if (!u.full_text || !u.unit_type || u.unit_type === "legacy") continue;
    const haystack = `${u.title || ""} ${u.summary || ""} ${u.full_text.slice(0, 800)}`;
    const tokens = tokenize(haystack);
    let score = 0;
    for (const t of target) if (tokens.has(t)) score++;
    if (!best || score > best.score) best = { unit: u, score };
  }
  if (!best || best.score < minOverlap) return null;
  const u = best.unit;
  return {
    id: u.id,
    unit_type: u.unit_type as UnitType,
    title: u.title,
    summary: u.summary,
    full_text: u.full_text!,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function naturaliseKeywordPhrase(keyword: string): string {
  const cleaned = keyword
    .toLowerCase()
    .replace(/\b(how|what|why|when|where|which|who|can|does|do|is|are|will|should|could|would)\b/g, " ")
    .replace(/\b(fix|help|work|mean|cost)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || keyword).replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns true if the line contains an inline attribution that satisfies the
 * QUOTE_ATTRIBUTION_RULE: an em/en-dash followed by a name, or an explicit
 * "Source:" / "(Source: ..." marker, or a markdown link in the same line.
 */
function lineHasAttribution(line: string): boolean {
  if (/\bSource\s*:/i.test(line)) return true;
  if (/\]\(https?:\/\//i.test(line)) return true;
  // Em-dash or "—" followed by Capitalised Name + comma + role
  if (/[—–-]\s+[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3},\s+[A-Za-z]/.test(line)) return true;
  return false;
}

function stripFabricatedQuotes(markdown: string): { out: string; removed: number } {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let removed = 0;

  // 1) Drop blockquote lines that lack attribution
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*>\s+/.test(line)) {
      // Look at this line + next non-empty line for attribution
      const next = (lines[i + 1] || "") + " " + (lines[i + 2] || "");
      if (!lineHasAttribution(line) && !lineHasAttribution(next)) {
        removed += 1;
        continue;
      }
    }
    kept.push(line);
  }

  // 2) Inline pattern: "(An?|The) (expert|doctor|specialist|clinician|orthodontist|dentist|surgeon)
  //    ... (noted|said|commented|observed|explained|stated|remarked|argued|warned)
  //    [,:]? "..."" — drop the whole sentence when no attribution on the line.
  const inlineRe =
    /(?:[A-Z][^.!?"]*?\b(?:expert|doctor|specialist|clinician|orthodontist|dentist|surgeon|physician|practitioner|authority)s?\b[^.!?"]*?\b(?:noted|said|commented|observed|explained|stated|remarked|argued|warned|told)\b[^.!?"]*?["“][^"”]{8,}["”][^.!?]*[.!?])/g;

  const cleaned = kept.map((line) => {
    if (lineHasAttribution(line)) return line;
    return line.replace(inlineRe, () => {
      removed += 1;
      return "";
    });
  });

  return { out: cleaned.join("\n"), removed };
}

function stripUnsourcedCurrencyClaims(markdown: string): { out: string; removed: number } {
  const lines = markdown.split("\n");
  let removed = 0;
  // Split paragraphs by lines, but evaluate sentence-by-sentence inside each line.
  const currencyRe = /[\$£€¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:USD|GBP|EUR|JPY))?/;
  const cleaned = lines.map((line) => {
    if (line.includes("|")) return line; // leave tables alone
    if (/^\s*>/.test(line)) return line;
    if (!currencyRe.test(line)) return line;
    if (lineHasAttribution(line)) return line;
    // Split into sentences and drop any sentence containing a currency figure
    // without inline attribution on the same line.
    const parts = line.split(/(?<=[.!?])\s+/);
    const keptParts = parts.filter((s) => {
      if (currencyRe.test(s)) {
        removed += 1;
        return false;
      }
      return true;
    });
    return keptParts.join(" ");
  });
  return { out: cleaned.join("\n"), removed };
}

function sanitiseGeneratedMarkdown(markdown: string, articleTitle: string): string {
  const titleIsLongQuery = articleTitle.trim().split(/\s+/).length >= 4;
  const titleRegex = titleIsLongQuery ? new RegExp(`\\b${escapeRegExp(articleTitle.trim())}\\b`, "gi") : null;
  const replacement = titleIsLongQuery ? naturaliseKeywordPhrase(articleTitle) : "";
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let titleHeadingSeen = false;
  let removedTables = 0;
  let rewrittenKeywords = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|[\s\-:|]+$/.test(lines[i + 1])) {
      const start = i;
      let end = i + 2;
      while (end < lines.length && lines[end].includes("|")) end++;
      const table = lines.slice(start, end).join("\n");
      if (/\bOption\s+[ABC]\b|\bType\s+[123]\b|\bChoice\s+[123]\b|\b(Beginners?|Intermediate users?|Advanced needs?)\b/i.test(table)) {
        removedTables += 1;
        i = end - 1;
        continue;
      }
    }

    const trimmed = line.trim();
    let out = line;
    if (titleRegex && replacement) {
      const isHeading = /^#{1,6}\s/.test(trimmed);
      if (isHeading && !titleHeadingSeen) {
        titleHeadingSeen = true;
      } else {
        const matches = out.match(titleRegex);
        if (matches) rewrittenKeywords += matches.length;
        out = out.replace(titleRegex, replacement);
      }
    }

    if (trimmed && !/^#{1,6}\s/.test(trimmed) && !/^\s*(\||[-*+]|\d+\.)\s?/.test(out) && !out.includes("|") && !/^>/.test(trimmed) && !/[.!?:)]\s*$/.test(trimmed)) {
      const lastTerm = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
      if (lastTerm > 20) out = out.slice(0, out.indexOf(trimmed) + lastTerm + 1);
    }

    kept.push(out);
  }

  let result = kept.join("\n");
  const q = stripFabricatedQuotes(result);
  result = q.out;
  const c = stripUnsourcedCurrencyClaims(result);
  result = c.out;

  if (removedTables > 0) console.warn(`PROPRIETARY SANITISER: removed ${removedTables} generic table(s).`);
  if (rewrittenKeywords > 0) console.warn(`PROPRIETARY SANITISER: rewrote ${rewrittenKeywords} exact title-query injection(s).`);
  if (q.removed > 0) console.warn(`PROPRIETARY SANITISER: stripped ${q.removed} unattributed quote(s).`);
  if (c.removed > 0) console.warn(`PROPRIETARY SANITISER: stripped ${c.removed} unsourced currency claim sentence(s).`);
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function buildFallbackBullets(heading: string, body: string): string[] {
  const cleanHeading = heading.replace(/[?!.]+$/g, "").toLowerCase();
  const hasFailure = /failure|risk|wrong|peri|loosen|cement|relapse|misdiagnos/i.test(body);
  return [
    `- Ask which specific ${cleanHeading} category applies before accepting a treatment plan.`,
    `- Check what failure mode the clinician is actively trying to prevent.`,
    `- Request the exact maintenance or review step that confirms the plan is working.`,
  ].map((line, idx) => (idx === 1 && !hasFailure ? `- Identify the clinical limitation before comparing visible benefits.` : line));
}

function enforceThreeBulletsPerBodySection(markdown: string): string {
  const skipPattern = /tl;?dr|quick\s*tips|frequently\s*asked|faq|final\s*thoughts|references|sources/i;
  const headingRegex = /^##\s+.+$/gm;
  const matches = [...markdown.matchAll(headingRegex)];
  if (matches.length === 0) return markdown.trim();
  const intro = markdown.slice(0, matches[0].index ?? 0).trim();
  const rebuilt = matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? markdown.length) : markdown.length;
    const headingLine = match[0];
    const heading = headingLine.replace(/^##\s+/, "").trim();
    const body = markdown.slice(start + headingLine.length, end).trim();
    if (skipPattern.test(heading)) return `${headingLine}\n${body}`.trim();
    const lines = body.split("\n");
    const bullets = lines.filter((line) => /^\s*-\s+/.test(line)).slice(0, 3);
    for (const fallback of buildFallbackBullets(heading, body)) {
      if (bullets.length >= 3) break;
      bullets.push(fallback);
    }
    const withoutExtraBullets = lines.filter((line) => !/^\s*[-*+]\s+/.test(line)).join("\n").trim();
    return `${headingLine}\n${[withoutExtraBullets, bullets.slice(0, 3).join("\n")].filter(Boolean).join("\n\n")}`.trim();
  });
  return [intro, ...rebuilt].filter(Boolean).join("\n\n").trim();
}

function countMarkdownTables(md: string): number {
  const lines = md.split("\n");
  let count = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes("|") && /^\s*\|?[\s\-:|]+\|[\s\-:|]+$/.test(lines[i + 1])) count++;
  }
  return count;
}

function fallbackTopicTable(topic: string): string {
  const t = topic.toLowerCase();
  if (/screwless|implant|morse|cement/.test(t)) return `| System type | How retention works | Screw visible in crown? | Common failure | Best-fit case |
| --- | --- | --- | --- | --- |
| Cement-retained crown | Cement bonds the crown to an abutment | No | Residual cement can inflame tissue | Aesthetic zones where an access hole would show |
| Friction-fit or Morse taper | Precision taper locks components mechanically | No | Retrieval can be difficult if repair is needed | Accurate single-tooth component seating |
| Screw-retained crown | Prosthetic screw fixes the crown to the implant | Yes | Access-channel aesthetics or screw loosening | Maintenance-heavy or retrievable cases |`;
  if (/invisalign|aligner|underbite|class\s*iii/.test(t)) return `| Case type | What drives the bite | Aligner suitability | Common failure | Consultation question |
| --- | --- | --- | --- | --- |
| Dental underbite | Tooth position creates the reverse bite | Stronger when movement is tooth-led | Treating the wrong mechanism wastes months | Is the problem dental or skeletal? |
| Skeletal underbite | Jaw relationship drives the bite | Limited without surgical assessment | Camouflage can worsen facial balance | Is surgery part of the realistic plan? |
| Combined pattern | Teeth and jaw both contribute | Case-dependent after diagnosis | Relapse or incomplete bite correction | Which part is being corrected first? |`;
  return "";
}


/* ── per-section generation (inlined from proprietary-generate-section) ─ */

async function runSection(input: {
  businessType: BusinessType;
  mappedUnit: MappedUnit | null;
  audienceSentence: string;
  publicationDestination: "ai-search" | "human-blog" | "both";
  section: SectionSpec;
  surroundingContext: Array<{ heading: string; content: string }>;
  articleTitle: string;
  model: string;
  sectionBudgetWords: number;
}) {
  const assembled = assembleSectionPrompt(input);
  const isBody = input.section.type === "body";
  const tokenBudget = isBody ? 1400 : 1000;
  let content = isBody
    ? (await callAnthropic(CLINICAL_SYSTEM_PROMPT_HEALTHCARE, buildClinicalUserMessage(input), tokenBudget)).trim()
    : (await callModel(assembled.system, assembled.user, input.model, tokenBudget)).trim();
  if (isBody) {
    content = trimSectionToBudget(content, input.sectionBudgetWords);
  }
  const needsExpertInput = /^\[NEEDS EXPERT INPUT\]\s*$/i.test(content);
  const ruleFlags = needsExpertInput ? [] : lintRule5(content);

  let contradicted = false;
  if (!needsExpertInput && input.mappedUnit?.unit_type === "contrarian") {
    const cp = buildContradictionPrompt({
      generatedSection: content,
      contrarianUnit: input.mappedUnit,
      sectionHeading: input.section.heading,
    });
    try {
      const raw = await callModel(cp.system, cp.user, input.model, 2200);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (parsed?.rewritten && typeof parsed.rewritten === "string") {
        contradicted = !!parsed.contradicted;
        if (contradicted) content = parsed.rewritten.trim();
      }
    } catch (e) {
      console.warn("Rule-6 pass failed (non-fatal):", e);
    }
  }
  return { content, needsExpertInput, ruleFlags, contradicted, appliedRules: isBody ? [1, 2, 3, 4, 5, 6, 7, 8] : assembled.appliedRules };
}

/* ── handler ──────────────────────────────────────────────────────────── */

const BUILD_MARKER = "BUILD-2026-05-27-C proprietary-generate-article";
Deno.serve(async (req) => {
  console.log(BUILD_MARKER);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    if (!body.topic?.trim()) {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = body.model || DEFAULT_MODEL;
    const wordCounts: Record<string, number> = { short: 500, medium: 1000, "medium-long": 1500, long: 2000, extended: 3000, comprehensive: 3500 };
    const targetWords = body.wordCount || wordCounts[body.length || "medium"] || 1000;
    const businessType: BusinessType = body.businessType || "healthcare-clinical";
    const audienceSentence =
      body.audienceSentence ||
      "Adults researching this topic who want a direct, expert-level answer.";
    const publicationDestination = body.publicationDestination || "both";

    // 1. Load brain units
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: rawUnits, error: brainErr } = await sb
      .from("brain_insights")
      .select("id, title, summary, full_text, unit_type")
      .limit(100);
    if (brainErr) console.warn("brain_insights fetch failed:", brainErr);
    const units: BrainUnit[] = (rawUnits as BrainUnit[]) || [];

    // 2. Outline (H2 generation uses original keyword-bearing topic)
    const h2Questions = await generateH2Questions(body.topic, model);
    if (h2Questions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Outline generation returned no questions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2b. Non-commodity title rewrite (used for H1 + downstream articleTitle).
    // Original body.topic is preserved for unit mapping and H2 generation so we
    // don't lose keyword anchoring.
    const articleTitle = await rewriteTitleNonCommodity(body.topic, model);

    // 3. Build section plan
    const includeFailureMode =
      businessType === "healthcare-clinical" || businessType === "service";
    const plan: SectionSpec[] = [
      { id: "opening", heading: "Opening", kind: "opening", type: "framing" },
      { id: "tldr", heading: "TL;DR", kind: "tldr", type: "framing" },
      { id: "quick-tips", heading: "Quick Tips", kind: "quick-tips", type: "framing" },
      ...h2Questions.map(
        (q, i): SectionSpec => ({
          id: `h2-${i + 1}`,
          heading: q,
          kind: "h2-question",
          type: "body",
        }),
      ),
      ...(includeFailureMode
        ? [
            {
              id: "failure",
              heading: "Where this commonly goes wrong",
              kind: "failure-mode" as const,
              type: "body" as const,
            },
          ]
        : []),
      { id: "faq", heading: "Frequently Asked Questions", kind: "faq", type: "framing" },
      {
        id: "final",
        heading: "Final thoughts",
        kind: "final-thoughts",
        type: "framing",
      },
    ];

    const fixedBudget = 40 + 70 + 45 + 120 + 55;
    const bodySectionCount = plan.filter((s) => s.type === "body").length || 1;
    const sectionBudgetWords = Math.max(90, Math.round((targetWords - fixedBudget) / bodySectionCount));

    // 4 + 5. Series generation with surrounding context
    const surrounding: Array<{ heading: string; content: string }> = [];
    const sectionsOut: Array<{
      id: string;
      heading: string;
      kind: string;
      type: string;
      mappedUnitId: string | null;
      mappedUnitType: string | null;
      content: string;
      needsExpertInput: boolean;
      ruleFlags: string[];
      contradicted: boolean;
      appliedRules: number[];
    }> = [];

    for (const section of plan) {
      const mappedUnit =
        section.type === "body" ? pickUnit(section.heading, body.topic, units) : null;

      const result = await runSection({
        businessType,
        mappedUnit,
        audienceSentence,
        publicationDestination,
        section,
        surroundingContext: surrounding.slice(),
        articleTitle,
        model,
        sectionBudgetWords,
      });

      surrounding.push({ heading: section.heading, content: result.content });
      sectionsOut.push({
        id: section.id,
        heading: section.heading,
        kind: section.kind,
        type: section.type,
        mappedUnitId: mappedUnit?.id ?? null,
        mappedUnitType: mappedUnit?.unit_type ?? null,
        content: result.content,
        needsExpertInput: result.needsExpertInput,
        ruleFlags: result.ruleFlags,
        contradicted: result.contradicted,
        appliedRules: result.appliedRules,
      });
    }

    // 6. Stitch
    const md: string[] = [`# ${articleTitle}`, ""];
    for (const s of sectionsOut) {
      if (s.kind === "opening") {
        md.push(s.content, "");
      } else if (s.kind === "tldr") {
        md.push("## TL;DR", "", s.content, "");
      } else if (s.kind === "quick-tips") {
        md.push("## Quick Tips", "", s.content, "");
      } else if (s.kind === "faq") {
        md.push("## Frequently Asked Questions", "", s.content, "");
      } else {
        md.push(`## ${s.heading}`, "", s.content, "");
      }
    }
    let stitched = md.join("\n").trim();
    stitched = enforceThreeBulletsPerBodySection(stitched);
    if (countMarkdownTables(stitched) < 1) {
      const table = fallbackTopicTable(body.topic);
      if (table) {
        const lines = stitched.split("\n");
        const bodyH2s = lines.map((line, i) => ({ line, i })).filter(({ line }) => /^##\s+/.test(line) && !/tl;?dr|quick\s*tips|frequently\s*asked|faq|final\s*thoughts|references|sources/i.test(line));
        const targetIdx = bodyH2s[Math.min(1, bodyH2s.length - 1)]?.i;
        if (typeof targetIdx === "number") {
          let endIdx = lines.length;
          for (let j = targetIdx + 1; j < lines.length; j++) if (/^##\s+/.test(lines[j])) { endIdx = j; break; }
          lines.splice(endIdx, 0, "", table, "");
          stitched = lines.join("\n");
        }
      }
    }
    const content = sanitiseGeneratedMarkdown(stitched, articleTitle);

    // mappedUnitTexts for downstream verification grading on the client
    const mappedUnitTexts: string[] = [];
    for (const s of sectionsOut) {
      if (!s.mappedUnitId) continue;
      const u = units.find((x) => x.id === s.mappedUnitId);
      if (u?.full_text) mappedUnitTexts.push(u.full_text);
    }

    return new Response(
      JSON.stringify({
        content,
        sections: sectionsOut,
        mappedUnitTexts,
        brainUnitCount: units.length,
        outline: h2Questions,
        articleTitle,
        originalTopic: body.topic,
        appliedRules: {
          gapAnalysisUsed: false,
          formatReferenceUsed: false,
          contextFilesUsed: units.length > 0,
          contextFileNames: [],
          keywordsUsed: false,
          keywords: [],
          targetWordCount: targetWords,
          outlineProvided: true,
          customInstructionsProvided: false,
          knowledgeBaseUsed: units.length > 0,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("proprietary-generate-article error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
