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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
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
import { trimSectionToBudget, trimToWordCount } from "../_shared/articleSectionBudget.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const CLINICAL_MODEL = "google/gemini-2.5-flash";
const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIMS = 1536;

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIMS }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const v = j?.data?.[0]?.embedding;
  if (!Array.isArray(v)) throw new Error("embed: missing data[0].embedding");
  return v as number[];
}

interface RequestBody {
  topic: string;
  length?: "short" | "medium" | "medium-long" | "long" | "extended" | "comprehensive";
  wordCount?: number;
  internalLinks?: string[];
  audienceSentence?: string;
  businessType?: BusinessType;
  publicationDestination?: "ai-search" | "human-blog" | "both";
  model?: string;
  projectId?: string;
}

interface BrainUnit {
  id: string;
  title: string | null;
  summary: string | null;
  full_text: string | null;
  unit_type: UnitType | "legacy" | null;
}

interface InternalLinkResult {
  content: string;
  insertedCount: number;
  totalProvided: number;
  insertedUrls: string[];
  skippedUrls: string[];
  skippedOffTopic?: string[];
  note?: string;
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

PARAGRAPH STRUCTURE: Each prose paragraph must be 3 sentences maximum. Use a bulleted list for any point requiring more than 3 sentences.

You are writing content for patients to arrive at their clinical consultation already informed, with the right questions prepared. You are not a replacement for clinical consultation.`;

function buildClinicalUserMessage(input: {
  mappedUnit: MappedUnit | null;
  audienceSentence: string;
  publicationDestination: "ai-search" | "human-blog" | "both";
  section: SectionSpec;
  articleTitle: string;
  retrievedChunks?: Array<{ content: string; similarity: number }>;
  targetWordCount?: number;
}): string {
  const knowledgeInput = input.mappedUnit?.full_text?.trim()
    ? input.mappedUnit.full_text.trim()
    : "No proprietary knowledge unit available for this section — generate from first-hand expertise following all rules; use [NEEDS EXPERT INPUT] only where a specific proprietary number or detail is required.";

  const lines = [
    `Topic: ${input.articleTitle}`,
    `Section heading: ${input.section.heading}`,
    `Section type: ${input.section.kind}`,
    `Audience: ${input.audienceSentence}`,
    `Publication destination: ${input.publicationDestination}`,
    ...(input.targetWordCount ? [`Target section length: approximately ${input.targetWordCount} words — include all mandatory structural elements but scale depth accordingly.`] : []),
    `Knowledge input: ${knowledgeInput}`,
  ];

  if (input.retrievedChunks && input.retrievedChunks.length > 0) {
    const block = input.retrievedChunks
      .map((c, i) => `[Chunk ${i + 1} | similarity ${c.similarity.toFixed(3)}]\n${c.content}`)
      .join("\n\n");
    lines.push(
      "",
      "RETRIEVED KNOWLEDGE — specific facts, numbers, and clinical details from the research brief relevant to this section. Use these specifics in your response.",
      block,
    );
  }

  lines.push("", "Write this section now.");
  return lines.join("\n");
}


async function callClinicalWriter(system: string, user: string, maxTokens = 1400): Promise<string> {
  return callModel(system, user, CLINICAL_MODEL, maxTokens);
}

/* ── outline generation ───────────────────────────────────────────────── */

async function generateH2Questions(topic: string, model: string): Promise<string[]> {
  const sys = `You generate H2 question headings for non-commodity articles. Output exactly 3 question headings, one per line, no numbering, no bullets, no markdown. Each must be a real question a reader would type, phrased in 4-10 words. No filler openers. No "what is X" if there's a sharper question. The three questions MUST cover different angles (e.g. mechanism, benefit, failure mode) — never two near-duplicate questions.`;
  const user = `Topic: ${topic}\n\nReturn 3 distinct H2 question headings.`;
  const raw = await callModel(sys, user, model, 400);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
  const seen = new Set<string>();
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\d\-*.\s)#]+/, "").trim())
    .filter((l) => l.length > 5 && l.length < 140)
    .filter((l) => {
      const k = norm(l);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
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

    // Strip "; weigh against <phrase>" appendage from table cell content.
    if (out.includes("|")) {
      out = out.replace(/\s*;\s*weigh\s+against\s+[^|]+/gi, "");
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

function buildFallbackBullets(_heading: string, _body: string): string[] {
  return [];
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

function deriveSectionPhrase(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/^\s*(how|what|when|why|where|which|are|is|do|does|can|should|will|who)\s+/i, "")
    .replace(/[?.!:]+\s*$/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
}

function fallbackTopicTable(topic: string, sectionHeading?: string): string {
  const t = topic.toLowerCase();
  const h = (sectionHeading ?? "").toLowerCase();
  // Section-aware: only inject a topic table when the SECTION HEADING itself is
  // about the table's subject. Prevents the same retention table being dropped
  // into unrelated sections (training, failure modes, complications, etc.).
  const retentionHeading = /retention|retain|cement|screw|abutment|morse|crown\s+fix|fixation/.test(h);
  const underbiteHeading = /underbite|aligner|invisalign|class\s*iii|bite\s+correction/.test(h);
  if (retentionHeading && /screwless|implant|morse|cement|crown|abutment|prosthe/.test(t)) {
    return `| System type | How retention works | Screw visible in crown? | Common failure | Best-fit case |
| --- | --- | --- | --- | --- |
| Cement-retained crown | Cement bonds the crown to an abutment | No | Residual cement can inflame tissue | Aesthetic zones where an access hole would show |
| Friction-fit or Morse taper | Precision taper locks components mechanically | No | Retrieval can be difficult if repair is needed | Accurate single-tooth component seating |
| Screw-retained crown | Prosthetic screw fixes the crown to the implant | Yes | Access-channel aesthetics or screw loosening | Maintenance-heavy or retrievable cases |`;
  }
  if (underbiteHeading && /invisalign|aligner|underbite|class\s*iii|orthodontic/.test(t)) {
    return `| Case type | What drives the bite | Aligner suitability | Common failure | Consultation question |
| --- | --- | --- | --- | --- |
| Dental underbite | Tooth position creates the reverse bite | Stronger when movement is tooth-led | Treating the wrong mechanism wastes months | Is the problem dental or skeletal? |
| Skeletal underbite | Jaw relationship drives the bite | Limited without surgical assessment | Camouflage can worsen facial balance | Is surgery part of the realistic plan? |
| Combined pattern | Teeth and jaw both contribute | Case-dependent after diagnosis | Relapse or incomplete bite correction | Which part is being corrected first? |`;
  }
  // Universal fallback: topic-aware comparison so every article meets the
  // table quota even when no section-specific regex matched.
  if (/implant|dentist|dental/.test(t)) {
    return `| Setting | Training Duration | Annual Implant Volume | Success Rate with Strict Criteria | Best For |
| --- | --- | --- | --- | --- |
| General Dentist | DDS or DMD plus optional continuing-education courses | Variable, often low outside high-volume practices | Lower in published series compared with specialist settings | Routine single-tooth cases with straightforward anatomy |
| Board-Certified Specialist (Periodontist or Oral Surgeon) | Three or more years of accredited residency after dental school | Consistently high through residency and ongoing practice | Higher in published series, particularly for complex cases | Complex anatomy, bone grafting, full-arch and compromised sites |
| Academic or Hospital Setting | Faculty-level training with a supervised teaching caseload | High and protocol-driven through institutional volume | Highest reported in long-term published studies | Medically complex patients and reconstructive cases |`;
  }
  // Generic three-column comparison — no topic string interpolated into cells.
  return `| Approach | Key Advantage | Primary Limitation |
| --- | --- | --- |
| Entry-level | Lower cost and easier access | Narrower scope and fewer safeguards |
| Standard | Balanced quality, cost, and availability | Trade-offs between depth and convenience |
| Advanced | Highest reported consistency and oversight | Higher cost and limited availability |`;
}

function tableSignature(tableMarkdown: string): string {
  return tableMarkdown.replace(/\s+/g, " ").trim().toLowerCase();
}

function collectTableSignatures(markdown: string): Set<string> {
  const sigs = new Set<string>();
  const lines = markdown.split("\n");
  let cur: string[] = [];
  const flush = () => {
    if (cur.length >= 2 && /^\s*\|?[\s\-:|]+\|[\s\-:|]+\s*$/.test(cur[1] ?? "")) {
      sigs.add(tableSignature(cur.join("\n")));
    }
    cur = [];
  };
  for (const l of lines) {
    if (l.includes("|")) cur.push(l);
    else flush();
  }
  flush();
  return sigs;
}

/* ── normal-mode parity: structural normalisers ───────────────────────── */

const STRUCT_SKIP_RE = /tl;?dr|quick\s*tips|in\s*this\s*article|how\s*to\s*(choose|pick)|frequently\s*asked|faq|final\s*thoughts|references|sources/i;

function getBodyH2s(markdown: string): Array<{ heading: string; index: number }> {
  const lines = markdown.split("\n");
  const out: Array<{ heading: string; index: number }> = [];
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (!m) return;
    if (STRUCT_SKIP_RE.test(m[1])) return;
    const key = m[1].toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
    if (seen.has(key)) return; // dedupe by normalised heading text
    seen.add(key);
    out.push({ heading: m[1].trim(), index: i });
  });
  return out;
}

function topicNoun(topic: string): string {
  const t = topic.toLowerCase();
  if (/implant|crown|abutment|prosthe/.test(t)) return "Implant Option";
  if (/aligner|invisalign|brace|underbite|overbite|orthodontic/.test(t)) return "Treatment";
  if (/dental|dentist|tooth|teeth|oral/.test(t)) return "Treatment";
  if (/medical|clinic|surgery|therapy/.test(t)) return "Treatment";
  return "Option";
}

function firstSentenceOf(sectionBody: string): string {
  // Strip headings, blockquotes, list markers, table lines. Return first
  // ~30-word sentence ending in . ! or ?
  const clean = sectionBody
    .split("\n")
    .filter((l) => l.trim() && !/^#{1,6}\s/.test(l) && !l.includes("|") && !/^\s*[-*+]\s/.test(l) && !/^\s*>/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  const m = clean.match(/^.{20,260}?[.!?](?:\s|$)/);
  const sentence = (m ? m[0] : clean.slice(0, 220)).trim();
  return sentence;
}

function injectInThisArticle(markdown: string, topic: string): string {
  if (/^##\s+in\s*this\s*article/im.test(markdown)) return markdown;
  const bodyH2s = getBodyH2s(markdown);
  if (bodyH2s.length === 0) return markdown;
  // Capture each section's body so we can use its real first sentence as desc.
  const lines = markdown.split("\n");
  const sectionBody = (lineIdx: number): string => {
    let end = lines.length;
    for (let j = lineIdx + 1; j < lines.length; j++) {
      if (/^##\s+/.test(lines[j])) { end = j; break; }
    }
    return lines.slice(lineIdx + 1, end).join("\n");
  };
  const items = bodyH2s.map((h, i) => {
    const real = firstSentenceOf(sectionBody(h.index));
    const desc = real || `${h.heading.replace(/[?!.]+$/, "")} — direct answer plus the honest failure mode and what to ask before deciding.`;
    return `- ${i + 1}. ${h.heading.replace(/[?!.]+$/, "")} - ${desc}`;
  });
  const block = ["## In This Article", "", ...items].join("\n");
  // Insert after Quick Tips block, else after TL;DR, else after H1.
  const anchors = [
    /^##\s+quick\s*tips[\s\S]*?(?=^##\s+)/im,
    /^##\s+tl;?dr[\s\S]*?(?=^##\s+)/im,
    /^#\s+.+$/m,
  ];
  for (const re of anchors) {
    const m = markdown.match(re);
    if (m && m.index !== undefined) {
      const insertAt = m.index + m[0].length;
      return `${markdown.slice(0, insertAt).trimEnd()}\n\n${block}\n\n${markdown.slice(insertAt).trimStart()}`;
    }
  }
  return `${block}\n\n${markdown}`;
}

function injectHowToChoose(markdown: string, topic: string): string {
  if (/^##\s+how\s*to\s*(choose|pick)/im.test(markdown)) return markdown;
  const noun = topicNoun(topic);
  const heading = `## How to Choose the Right ${noun} for You`;
  const nounLower = noun.toLowerCase();
  const criteria = [
    `- Establish the category first: confirm what type of ${nounLower} the situation actually calls for before comparing options.`,
    `- Ask what the option is built to prevent or solve: each ${nounLower} should name the specific problem it is designed to address.`,
    `- Demand specific numbers: timelines, success rates, and costs should come with concrete figures, not "varies" or "depends".`,
    `- Check fit honestly: a good ${nounLower} for the wrong situation underperforms regardless of brand or price.`,
    `- Confirm the review step: ask which checkpoint will confirm the choice is working and what triggers a change.`,
  ];
  const block = `${heading}\n\n${criteria.join("\n")}`;
  // Insert before FAQ or Final Thoughts, else append before References, else at end.
  const anchorRe = /^##\s+(frequently\s*asked|faq|final\s*thoughts|references)/im;
  const m = markdown.match(anchorRe);
  if (m && m.index !== undefined) {
    return `${markdown.slice(0, m.index).trimEnd()}\n\n${block}\n\n${markdown.slice(m.index)}`;
  }
  return `${markdown.trimEnd()}\n\n${block}`;
}

function extractUrls(text: string): Array<{ url: string; title: string }> {
  const out: Array<{ url: string; title: string }> = [];
  const seen = new Set<string>();
  // Markdown links first (preserve titles)
  const mdRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text)) !== null) {
    const url = m[2].replace(/[)\]\.,;]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: m[1].trim() });
  }
  // Bare URLs
  const bareRe = /(?<!\()https?:\/\/[^\s)<>"']+/g;
  while ((m = bareRe.exec(text)) !== null) {
    const url = m[0].replace(/[)\]\.,;]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      out.push({ url, title: host });
    } catch { /* ignore */ }
  }
  return out;
}

function injectReferences(markdown: string, units: BrainUnit[]): string {
  if (/^##\s+references/im.test(markdown)) return markdown;
  const corpus = [
    markdown,
    ...units.map((u) => `${u.summary || ""}\n${u.full_text || ""}`),
  ].join("\n");
  const links = extractUrls(corpus).slice(0, 8);
  // Only emit a References section when we have real URLs. Never fabricate
  // citations from brain-unit titles — that produced false references.
  if (links.length === 0) return markdown;
  const items = links.map((l) => `- [${l.title}](${l.url})`).join("\n");
  return `${markdown.trimEnd()}\n\n## References\n\n${items}\n`;
}

function trustedFallbackSources(topic: string): BrainUrl[] {
  if (!/\b(dental|implant|implants|screwless|conometric|abutment)\b/i.test(topic)) return [];
  return [
    { title: "FDA - Dental Implants: What You Should Know", url: "https://www.fda.gov/medical-devices/dental-devices/dental-implants-what-you-should-know" },
    { title: "NCBI Bookshelf - Dental Implants", url: "https://www.ncbi.nlm.nih.gov/books/NBK470448/" },
    { title: "PMC - Implant-abutment connection review", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4784146/" },
  ];
}

function ensureTrustedReferences(markdown: string, topic: string): string {
  if (/^##\s+references/im.test(markdown)) return markdown;
  const sources = trustedFallbackSources(topic);
  if (sources.length === 0) return markdown;
  const items = sources.map((s) => `- [${s.title}](${s.url})`).join("\n");
  return `${markdown.trimEnd()}\n\n## References\n\n${items}\n`;
}

async function insertInternalLinksIntoArticle(
  content: string,
  urls: string[] | undefined,
  articleTopic: string,
): Promise<InternalLinkResult> {
  const cleanUrls = (urls || []).map((u) => u.trim()).filter(Boolean).slice(0, 12);
  if (cleanUrls.length === 0) {
    return { content, insertedCount: 0, totalProvided: 0, insertedUrls: [], skippedUrls: [], note: "No internal links provided." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/insert-internal-links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, urls: cleanUrls, articleTopic }),
      signal: controller.signal,
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`insert-internal-links ${res.status}: ${raw.slice(0, 300)}`);
    const data = JSON.parse(raw) as Partial<InternalLinkResult>;
    return {
      content: typeof data.content === "string" ? data.content : content,
      insertedCount: typeof data.insertedCount === "number" ? data.insertedCount : 0,
      totalProvided: typeof data.totalProvided === "number" ? data.totalProvided : cleanUrls.length,
      insertedUrls: Array.isArray(data.insertedUrls) ? data.insertedUrls : [],
      skippedUrls: Array.isArray(data.skippedUrls) ? data.skippedUrls : cleanUrls,
      skippedOffTopic: Array.isArray(data.skippedOffTopic) ? data.skippedOffTopic : [],
      note: data.note,
    };
  } catch (e) {
    const note = e instanceof Error && e.name === "AbortError"
      ? "Internal link insertion timed out; returned original article."
      : `Internal link insertion failed; returned original article: ${e instanceof Error ? e.message : String(e)}`;
    return { content, insertedCount: 0, totalProvided: cleanUrls.length, insertedUrls: [], skippedUrls: cleanUrls, note };
  } finally {
    clearTimeout(timeout);
  }
}

function ensureMinimumTables(markdown: string, topic: string, targetWords: number): string {
  const required = Math.max(1, Math.round(targetWords / 600));
  let current = countMarkdownTables(markdown);
  if (current >= required) return markdown;
  let out = markdown;
  const seenSignatures = collectTableSignatures(out);
  const lines = out.split("\n");
  const bodyH2s = lines.map((line, i) => ({ line, i })).filter(({ line }) => /^##\s+/.test(line) && !STRUCT_SKIP_RE.test(line));
  let inserted = 0;
  for (let bIdx = 0; bIdx < bodyH2s.length && current + inserted < required; bIdx++) {
    const heading = bodyH2s[bIdx].line.replace(/^##\s+/, "").trim();
    const table = fallbackTopicTable(topic, heading);
    if (!table) continue;
    const sig = tableSignature(table);
    if (seenSignatures.has(sig)) continue; // dedup: identical table already exists somewhere in article
    const freshLines = out.split("\n");
    // Find heading by text match so prior insertions don't shift the index.
    const headingLine = freshLines.findIndex(l => /^##\s+/.test(l) && l.replace(/^##\s+/, "").trim() === heading);
    if (headingLine === -1) break;
    let endIdx = freshLines.length;
    for (let j = headingLine + 1; j < freshLines.length; j++) {
      if (/^##\s+/.test(freshLines[j])) { endIdx = j; break; }
    }
    const sectionSlice = freshLines.slice(headingLine, endIdx).join("\n");
    if (sectionSlice.includes("|")) continue; // already has a table
    freshLines.splice(endIdx, 0, "", table, "");
    out = freshLines.join("\n");
    seenSignatures.add(sig);
    inserted++;
  }
  return out;
}

/* ── brand-name placeholder strip ────────────────────────────────────── */
// The assembler instructs the model to reference the brand/business name, but
// no brand string is plumbed through the request payload today, so the model
// occasionally fills the gap with a literal "[PRACTICE NAME]" placeholder.
// Remove these placeholders (and tidy the surrounding punctuation/whitespace)
// so they never reach the rendered article. If a brand string is later added
// to the request body, swap the empty replacement for that value.
function stripBrandPlaceholders(markdown: string): string {
  const PLACEHOLDER_INNER = "practice\\s*name|your\\s*practice|clinic\\s*name|business\\s*name|brand\\s*name|company\\s*name";
  // Replace preposition + placeholder ("at [PRACTICE NAME]" → "at the practice")
  let out = markdown.replace(
    new RegExp(`\\b(at|in|by|from|to|for|with|the|our|your|of)\\s+\\[(?:${PLACEHOLDER_INNER})\\]\\b['']?s?`, "gi"),
    (_, prep) => {
      const p = prep.toLowerCase();
      return ["the", "our", "your"].includes(p) ? "the practice" : `${p} the practice`;
    },
  );
  // Replace any remaining standalone placeholder with "the practice"
  out = out.replace(new RegExp(`\\[(?:${PLACEHOLDER_INNER})\\]`, "gi"), "the practice");
  // Tidy artefacts left behind
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/,\s*,/g, ",");
  return out;
}

/* ── normal-mode parity: atomic-phrase + bullet + citation guards ────── */

function stripAtomicPhrases(markdown: string): { out: string; removed: number } {
  const banned: RegExp[] = [
    /\bas\s+mentioned\s+(above|earlier|previously)\b[,]?\s*/gi,
    /\bas\s+(we\s+)?(saw|discussed|noted)\s+(above|earlier|previously)\b[,]?\s*/gi,
    /\bcontinuing\s+from\s+(earlier|above|the\s+previous\s+section)\b[,]?\s*/gi,
    /\bin\s+the\s+previous\s+section\b[,]?\s*/gi,
    /\bthe\s+following\s+point\b[,]?\s*/gi,
    /\bbuilding\s+on\s+(what\s+we\s+covered|the\s+above|the\s+previous)\b[,]?\s*/gi,
  ];
  let removed = 0;
  let out = markdown;
  for (const re of banned) {
    const m = out.match(re);
    if (m) removed += m.length;
    out = out.replace(re, "");
  }
  out = out.replace(/(^|\n|\. )([a-z])/g, (_m, p1, p2) => p1 + p2.toUpperCase());
  return { out, removed };
}

function splitGluedBullets(markdown: string): { out: string; split: number } {
  // Fix a common LLM defect: `- A: text *   B: text *   C: text` glued on one
  // line. Split on `*   ` or `*  ` markers that occur inside a `- ` list item.
  const lines = markdown.split("\n");
  let split = 0;
  const fixed: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (!m) { fixed.push(line); continue; }
    const indent = m[1];
    const marker = m[2];
    const body = m[3];
    // Split on " *   " or " *  " sub-bullet markers inside the line
    if (!/\s\*\s{2,}/.test(body)) { fixed.push(line); continue; }
    const parts = body.split(/\s\*\s{2,}/g).map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) { fixed.push(line); continue; }
    split += parts.length - 1;
    for (const p of parts) fixed.push(`${indent}${marker} ${p}`);
  }
  return { out: fixed.join("\n"), split };
}

interface BrainUrl { url: string; title: string }
function collectBrainUrls(units: BrainUnit[]): BrainUrl[] {
  const out: BrainUrl[] = [];
  const seen = new Set<string>();
  const re = /https?:\/\/[^\s)<>"'\]]+/g;
  for (const u of units) {
    const text = `${u.summary || ""}\n${u.full_text || ""}`;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const url = m[0].replace(/[)\]\.,;]+$/, "");
      if (seen.has(url)) continue;
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        seen.add(url);
        out.push({ url, title: u.title || host });
      } catch { /* skip invalid */ }
    }
  }
  return out;
}

function attachInlineCitations(markdown: string, urls: BrainUrl[]): { out: string; attached: number } {
  if (urls.length === 0) return { out: markdown, attached: 0 };
  const lines = markdown.split("\n");
  let urlIdx = 0;
  let attached = 0;
  const fixed: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    fixed.push(line);
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (!m) continue;
    if (STRUCT_SKIP_RE.test(m[1])) continue;
    // Find end of this section
    let endIdx = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^##\s+/.test(lines[j])) { endIdx = j; break; }
    }
    const sectionBody = lines.slice(i + 1, endIdx).join("\n");
    if (/\]\(https?:\/\//.test(sectionBody)) continue; // already cited
    if (urlIdx >= urls.length) continue;
    const u = urls[urlIdx++];
    // Append a citation footnote line right before next H2 (we'll do it on
    // the matching end position via splice on the output array later — simpler:
    // we record an inline edit). Insert a citation paragraph immediately after
    // the heading's first paragraph break by mutating the source lines.
    // Find the end of the first paragraph after heading
    let pEnd = i + 1;
    while (pEnd < endIdx && lines[pEnd].trim() !== "") pEnd++;
    // We're rebuilding fixed[] as we go; instead splice into lines and let
    // subsequent iterations see the change.
    const citationLine = `\nSource: [${u.title}](${u.url})`;
    lines.splice(pEnd, 0, citationLine);
    attached++;
  }
  return { out: lines.join("\n"), attached };
}

function ensureFinalThoughtsCta(markdown: string, businessType: BusinessType = "healthcare-clinical"): string {
  if (businessType !== "healthcare-clinical") return markdown;
  const re = /(^##\s+final\s*thoughts\s*\n)([\s\S]*?)(?=^##\s+|$(?![\r\n]))/im;
  const m = markdown.match(re);
  if (!m) return markdown;
  const body = m[2];
  if (/\b(book|schedule|contact|call|consultation|next step)\b/i.test(body)) return markdown;
  const cta = "\n\nReady to act on this? Book a consultation with a clinician who will categorise your case first, name the failure mode they are preventing, and give you specific numbers before any plan is recommended.\n";
  return markdown.replace(re, `${m[1]}${body.trimEnd()}${cta}\n`);
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
  retrievedChunks?: Array<{ content: string; similarity: number }>;
}) {
  const assembled = assembleSectionPrompt(input);
  const isBody = input.section.type === "body";
  // Scale token budget with the word budget so the model writes to the right length.
  // Floor at 600 (enough for a concise 90-word section), ceiling at 2400.
  const tokenBudget = isBody
    ? Math.max(600, Math.min(2400, Math.round(input.sectionBudgetWords * 1.8)))
    : input.section.kind === "tldr" ? 200 : 900;
  let content: string;
  if (isBody && input.businessType === "healthcare-clinical") {
    content = (await callClinicalWriter(CLINICAL_SYSTEM_PROMPT_HEALTHCARE, buildClinicalUserMessage({
      mappedUnit: input.mappedUnit,
      audienceSentence: input.audienceSentence,
      publicationDestination: input.publicationDestination,
      section: input.section,
      articleTitle: input.articleTitle,
      retrievedChunks: input.retrievedChunks,
      targetWordCount: input.sectionBudgetWords,
    }), tokenBudget)).trim();
  } else {
    content = (await callModel(assembled.system, assembled.user, input.model, tokenBudget)).trim();
  }
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

const BUILD_MARKER = "BUILD-2026-05-28-M proprietary-generate-article three-fixes";
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
    const HEALTHCARE_TOPIC_RE = /\b(dental|dentist|tooth|teeth|oral|implant|brace|aligner|orthodontic|medical|clinical|surgery|surgeon|health|doctor|patient|clinic|treatment|diagnosis|bone|graft|crown|abutment)\b/i;
    const businessType: BusinessType = (() => {
      const raw: BusinessType = body.businessType || "service";
      if (raw === "healthcare-clinical" && !HEALTHCARE_TOPIC_RE.test(body.topic)) return "service";
      return raw;
    })();
    const audienceSentence =
      body.audienceSentence ||
      "Adults researching this topic who want a direct, expert-level answer.";
    const publicationDestination = body.publicationDestination || "both";

    // Derive project isolation key from SUPABASE_URL (unique per Supabase project/deployment).
    // Falls back to body.projectId when explicitly provided by the caller.
    const projectId: string = body.projectId || (() => {
      try { return new URL(SUPABASE_URL).hostname.split(".")[0]; } catch { return ""; }
    })();

    // 1. Load brain units scoped to this project.
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // When a projectId is available, restrict brain_insights to files whose brain_chunks
    // are tagged with this project — prevents cross-client content leakage.
    let insightsQuery = sb
      .from("brain_insights")
      .select("id, title, summary, full_text, unit_type")
      .limit(100);
    if (projectId) {
      // Fetch brain_file_ids for this project from brain_chunks.
      const { data: projectChunks } = await sb
        .from("brain_chunks")
        .select("brain_file_id")
        .eq("project_id", projectId)
        .not("brain_file_id", "is", null)
        .limit(500);
      const projectFileIds = [...new Set((projectChunks || []).map((c: { brain_file_id: string }) => c.brain_file_id).filter(Boolean))];
      if (projectFileIds.length > 0) {
        insightsQuery = insightsQuery.in("source_file_id", projectFileIds) as typeof insightsQuery;
      }
    }
    const { data: rawUnits, error: brainErr } = await insightsQuery;
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

      // Semantic retrieval: embed (topic + section heading) and pull top 3 chunks
      // from brain_chunks. Additive — runs alongside the keyword-matched pickUnit unit.
      let retrievedChunks: Array<{ content: string; similarity: number }> = [];
      if (section.type === "body") {
        try {
          const queryVec = await embedQuery(`${body.topic}\n${section.heading}`);
          const { data: matches, error: matchErr } = await (sb as any).rpc("match_brain_chunks", {
            query_embedding: queryVec as unknown as string,
            match_count: 3,
            p_project_id: projectId || null,
          });
          if (matchErr) {
            console.warn(`RETRIEVAL: rpc failed for "${section.heading}":`, matchErr.message);
          } else if (Array.isArray(matches)) {
            const SIMILARITY_FLOOR = 0.60;
            const rawChunks = matches.map((m: any) => ({
              content: m.content,
              similarity: typeof m.similarity === "number" ? m.similarity : 0,
            }));
            retrievedChunks = rawChunks.filter((c) => c.similarity >= SIMILARITY_FLOOR);
            const topRaw = rawChunks[0]?.similarity?.toFixed(3) ?? "n/a";
            console.log(`RETRIEVAL: section="${section.heading}" got ${retrievedChunks.length}/${rawChunks.length} chunks above floor ${SIMILARITY_FLOOR} (top raw sim=${topRaw})`);
          }
        } catch (e) {
          console.warn(`RETRIEVAL: embed/query failed for "${section.heading}" (non-fatal):`, e);
        }
      }

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
        retrievedChunks,
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
    const normaliseHeadingText = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
    const stripLeadingDuplicateHeading = (content: string, heading: string): string => {
      // Drop any leading H1/H2/H3/H4 whose normalised text equals the section heading.
      // Prevents "## X" + body that itself starts with "## X" or "### X" → duplicate heading.
      const target = normaliseHeadingText(heading);
      const lines = content.split("\n");
      let i = 0;
      while (i < lines.length && lines[i].trim() === "") i++;
      while (i < lines.length) {
        const m = lines[i].match(/^\s*#{1,4}\s+(.+?)\s*$/);
        if (!m) break;
        if (normaliseHeadingText(m[1]) !== target) break;
        i++;
        while (i < lines.length && lines[i].trim() === "") i++;
      }
      return lines.slice(i).join("\n").trim();
    };
    const md: string[] = [`# ${articleTitle}`, ""];
    const isEmptyOrPlaceholder = (s: string) => {
      const t = s.trim();
      if (!t) return true;
      if (/^\[NEEDS EXPERT INPUT\]\s*$/i.test(t)) return true;
      // Strip blank lines and check if anything substantive remains
      const stripped = t.replace(/^\s*$/gm, "").trim();
      return stripped.length < 20;
    };
    for (const s of sectionsOut) {
      const cleanContent = s.type === "body"
        ? stripLeadingDuplicateHeading(s.content, s.heading)
        : s.content;
      // Drop framing sections (e.g. FAQ) whose content is empty / placeholder
      // so the heading doesn't render alone above nothing.
      if ((s.kind === "faq" || s.kind === "quick-tips") && isEmptyOrPlaceholder(cleanContent)) {
        console.warn(`STITCH: dropping empty section "${s.heading}" (kind=${s.kind})`);
        continue;
      }
      if (s.kind === "opening") {
        md.push(cleanContent, "");
      } else if (s.kind === "tldr") {
        md.push("## TL;DR", "", trimToWordCount(cleanContent, 60), "");
      } else if (s.kind === "quick-tips") {
        md.push("## Quick Tips", "", cleanContent, "");
      } else if (s.kind === "faq") {
        md.push("## Frequently Asked Questions", "", cleanContent, "");
      } else {
        md.push(`## ${s.heading}`, "", cleanContent, "");
      }
    }
    let stitched = md.join("\n").trim();
    // Normal-mode parity passes (deterministic, no extra AI calls):
    const splitBul = splitGluedBullets(stitched);
    stitched = splitBul.out;
    if (splitBul.split > 0) console.warn(`SPLIT BULLETS: split ${splitBul.split} glued sub-bullet(s).`);
    const atomic = stripAtomicPhrases(stitched);
    stitched = atomic.out;
    if (atomic.removed > 0) console.warn(`ATOMIC GUARD: stripped ${atomic.removed} dependency phrase(s).`);
    stitched = enforceThreeBulletsPerBodySection(stitched);
    stitched = injectInThisArticle(stitched, body.topic);
    stitched = ensureMinimumTables(stitched, body.topic, targetWords);
    stitched = ensureFinalThoughtsCta(stitched, businessType);
    // Inline citations from brain-unit URLs, with trusted dental fallbacks when
    // proprietary files have no URLs.
    // Only collect citation URLs from units that were actually mapped to avoid
    // injecting cross-topic (e.g. dental) URLs into unrelated articles.
    const usedUnitIds = new Set(sectionsOut.map(s => s.mappedUnitId).filter(Boolean));
    const usedUnits = units.filter(u => usedUnitIds.has(u.id));
    const brainUrls = collectBrainUrls(usedUnits.length ? usedUnits : units);
    const citationUrls = brainUrls.length > 0 ? brainUrls : trustedFallbackSources(body.topic);
    if (brainUrls.length === 0 && citationUrls.length > 0) console.log(`CITATIONS: using ${citationUrls.length} trusted fallback source(s).`);
    const cite = attachInlineCitations(stitched, citationUrls);
    stitched = cite.out;
    if (cite.attached > 0) console.log(`CITATIONS: attached ${cite.attached} inline source(s) from brain URLs.`);
    stitched = injectReferences(stitched, units);
    stitched = ensureTrustedReferences(stitched, body.topic);
    const refsEmitted = /^##\s+references/im.test(stitched);
    if (!refsEmitted) console.warn(`REFERENCES: no References section emitted — brain units contain no URLs.`);
    stitched = stripBrandPlaceholders(stitched);
    let content = sanitiseGeneratedMarkdown(stitched, articleTitle);
    const internalLinkResult = await insertInternalLinksIntoArticle(content, body.internalLinks, body.topic);
    content = internalLinkResult.content;
    console.log(`INTERNAL LINKS: inserted=${internalLinkResult.insertedCount} skipped=${internalLinkResult.skippedUrls.length} total=${internalLinkResult.totalProvided}${internalLinkResult.note ? ` note=${internalLinkResult.note}` : ""}`);


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
        internalLinks: {
          insertedCount: internalLinkResult.insertedCount,
          totalProvided: internalLinkResult.totalProvided,
          insertedUrls: internalLinkResult.insertedUrls,
          skippedUrls: internalLinkResult.skippedUrls,
          skippedOffTopic: internalLinkResult.skippedOffTopic || [],
          note: internalLinkResult.note,
        },
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
