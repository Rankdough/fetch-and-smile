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
  entityBridgeConfig?: {
    brandName: string;
    collectionUrl: string;
    productLabel: string;
    sportLabel: string;
  };
  audienceSentence?: string;
  businessType?: BusinessType;
  publicationDestination?: "ai-search" | "human-blog" | "both";
  model?: string;
  projectId?: string;
  contextFiles?: Array<{ name: string; content: string }>;
  toneProfileId?: string | null;
  valuePromiseClaims?: string[];
  gapAnalysis?: string;
  gapInsights?: string[];
  keywords?: string[];
}

interface BrainUnit {
  id: string;
  title: string | null;
  summary: string | null;
  full_text: string | null;
  unit_type: UnitType | "legacy" | null;
  source_file_id?: string | null;
}

interface RetrievedChunk {
  content: string;
  similarity: number;
  brain_file_id?: string | null;
  context_document_id?: string | null;
}

interface ContextDocumentRow {
  id: string;
  file_name: string;
  content?: string | null;
}

interface SourceReference {
  title: string;
  url?: string;
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

const CLINICAL_SYSTEM_PROMPT_HEALTHCARE = `You are an elite clinical medical and surgical investigator. You are forbidden from acting like an open-domain internet text aggregator. You must generate content that operates exclusively as a dense, high-friction diagnostic manual, maintaining an absolute information-gain threshold.

You must mathematically adhere to these strict non-commodity architectural constraints:

1. DEFINITION OF NON-COMMODITY COMPLIANCE (RULE 5, 9, 10):

RULE 5 (ZERO DEFENSIVE HEDGING): You are strictly banned from utilizing defensive internet safety-nets. Banned phrases include: "typically symptoms of", "may experience", "can vary based on", "results from a range of factors", or "consult your doctor to find out". Statements must be absolute, direct, and anchored to an isolated data node. If a fact is missing from the context documents, write [NEEDS EXPERT INPUT].

RULE 9 (IMMEDIATE ANSWER PROXIMITY): The absolute first sentence beneath any H1 or H2 heading must instantly deliver the core analytical milestone or anatomical data point. Zero introductory filler, zero conversational transitions, and zero throat-clearing fluff.

RULE 10 (SCIENTIFIC PATHWAY SPECIFICITY): Avoid generic descriptions. You must explicitly name exact physiological mechanisms, tissue boundaries, metabolic timelines (e.g., specific hourly onset curves), named biomarkers, antibody thresholds, and surgical metrics.

2. DEFINITION OF READER USEFULNESS & VALUE-GAIN (THE AUDIT TEST):

NONSENSE DESCRIPTION BAN: Do not write encyclopedia definitions (e.g., "Dental implants are titanium screws placed in the jaw"). Content must be framed as a tactical decision-making playbook for a consumer managing a high-stakes scenario.

FAILURE MODE INTEGRATION MANDATE: Every major structural module must explicitly arm the reader with an un-googleable failure trap warning. You must detail exact systemic operational errors (e.g., how premature dietary removal drops tTG-IgA antibody counts to zero and permanently blinds clinical blood assays, or the exact 50-implant cumulative surgical cliff where complication rates double). If an article contains no structural failure trap warnings, it is classified as low-value commodity waste and rejected.

3. WORKSPACE DATA FIREWALL (ANTI-CROSS-POLLINATION):

You must strictly isolate your clinical vocabulary to the active folder data. If the current workspace is Dental Implants, you are programmatically banned from utilizing keywords, symptoms, or contexts from other verticals (e.g., tracking dietary response, bloating, or food exposure). If a cross-contamination occurs, the generation sequence will fail compilation.

PARAGRAPH STRUCTURE: Each prose paragraph must be 3 sentences maximum. Use a bulleted list for any point requiring more than 3 sentences.

You are writing content for patients to arrive at their clinical consultation already informed, with the right questions prepared. You are not a replacement for clinical consultation.`;

function buildClinicalUserMessage(input: {
  mappedUnit: MappedUnit | null;
  audienceSentence: string;
  publicationDestination: "ai-search" | "human-blog" | "both";
  section: SectionSpec;
  articleTitle: string;
  retrievedChunks?: RetrievedChunk[];
  targetWordCount?: number;
  contextFiles?: Array<{ name: string; content: string }>;
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
  ];

  // BUILD-2026-05-29-I: context files are emitted FIRST in the clinical
  // writer payload (ahead of mapped unit + retrieved chunks) with an explicit
  // extraction directive. The model must treat them as the authoritative
  // source of raw data points, named timelines, and clinical criteria.
  if (input.contextFiles && input.contextFiles.length > 0) {
    const contextBlock = input.contextFiles
      .map((f) => `--- ${f.name} ---\n${stripCrossDomainFallbackBullets(stripBodyNumericCitationMarkers(f.content).out, input.articleTitle).out}`)
      .join("\n\n");
    lines.push(
      "",
      "🚨 PRIMARY SOURCE OF TRUTH — UPLOADED CONTEXT FILES (HIGHEST PRIORITY).",
      "These files override every other knowledge source. Pull raw, unvarnished",
      "data points directly from them: exact numbers, named timelines, dosages,",
      "eligibility criteria, contraindications, study names, percentages, and",
      "specific medical/clinical criteria. Quote verbatim where a phrase is",
      "diagnostic. Do not paraphrase a fact into a softer summary. If a required",
      "fact is missing from these files, write [NEEDS EXPERT INPUT] rather than",
      "falling back to a generic summary. Never reproduce bracketed footnote",
      "markers like [1] or [2,3] in your output — cite sources inline as prose.",
      "",
      contextBlock,
    );
  }


  lines.push("", `Knowledge input: ${knowledgeInput}`);

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

async function generateH2Questions(topic: string, model: string, valuePromiseClaims?: string[], gapInsights?: string[]): Promise<string[]> {
  // Generate enough H2s to cover every value promise — minimum 1 H2 per promise
  // so no promise gets squeezed into a secondary mention
  const promiseCount = valuePromiseClaims?.length || 0;
  const h2Count = Math.max(3, promiseCount); // at least 3, more if promises demand it
  const gapBlock = gapInsights && gapInsights.length > 0
    ? `\n\nCOMPETITOR GAPS — angles the top-ranking competitors miss. Where a promise and a gap overlap, prefer phrasing that heading around the gap. Use any remaining heading slots beyond the promises for these gaps:\n${gapInsights.map((g, i) => `${i + 1}. ${g}`).join("\n")}`
    : "";
  const promiseBlock = promiseCount > 0
    ? `\n\nVALUE PROMISES — MANDATORY COVERAGE: This article MUST deliver ALL ${promiseCount} of these specific reader outcomes. Generate exactly ONE dedicated H2 section for each promise below. Each H2 heading must directly echo the promise it covers:\n${valuePromiseClaims!.map((p, i) => `PROMISE ${i + 1}: ${p}`).join("\n")}`
    : "";
  const sys = `You generate H2 question headings for non-commodity articles. Output exactly ${h2Count} question headings, one per line, no numbering, no bullets, no markdown. Each must be a real question a reader would type, phrased in 4-10 words. No filler openers. No "what is X" if there's a sharper question. Questions MUST cover different angles — never two near-duplicate questions. When value promises are provided, generate ONE heading per promise, in the same order as the promises.`;
  const user = `Topic: ${topic}${promiseBlock}${gapBlock}\n\nReturn exactly ${h2Count} distinct H2 question headings. If promises are listed above, the first ${promiseCount} headings must each directly address one promise in order.`;
  const raw = await callModel(sys, user, model, 600);
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

/**
 * Generate a topic-specific H2 heading for the failure-mode section.
 * Replaces the previous hardcoded "Where this commonly goes wrong" string so
 * every article gets a unique, on-topic framing. Falls back to a sensible
 * generic phrasing if the model call fails or returns garbage.
 */
async function generateFailureModeHeading(
  topic: string,
  articleTitle: string,
  model: string,
): Promise<string> {
  const fallback = `Where ${topic.toLowerCase()} commonly goes wrong`;
  const sys = `You write a single H2 heading (4–10 words) that names the most common failure mode, mistake, or pitfall readers make on the given topic. Return ONLY the heading text — no quotes, no markdown, no "#", no trailing punctuation. British English. No buzzwords ("ultimate", "navigate", "unlock"). It must read like a real editorial sub-heading, not a template.`;
  const user = `Topic: ${topic}\nArticle title: ${articleTitle}\n\nWrite the H2 heading.`;
  try {
    const raw = (await callModel(sys, user, model, 60)).trim();
    const cleaned = raw
      .replace(/^#+\s*/, "")
      .replace(/^["'“”']|["'“”']$/g, "")
      .replace(/[.!?]+\s*$/, "")
      .split(/\r?\n/)[0]
      .trim();
    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (cleaned.length < 8 || cleaned.length > 120 || wordCount < 3 || wordCount > 14) {
      console.warn(`FAILURE HEADING: out-of-range (${cleaned.length} chars, ${wordCount} words), using fallback`);
      return fallback;
    }
    console.log(`FAILURE HEADING: "${cleaned}"`);
    return cleaned;
  } catch (e) {
    console.warn("FAILURE HEADING generation failed (non-fatal):", e);
    return fallback;
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

    // Punctuation completion: snap a stray prose line back to its last terminal
    // mark. Defensive: skip raw HTML lines so an inline style like
    // `line-height: 1.6` cannot be truncated at the `.` and rendered as
    // escaped HTML text. (References are now pure markdown — BUILD-O.)
    // BUILD-2026-05-29-Q: only treat `.` `!` `?` as terminators when they
    // are followed by whitespace/quote/end-of-string AND, for `.`, are NOT
    // preceded by a digit (decimals like "32.5%" or "1.6" would otherwise
    // be sliced mid-number, producing fragments like "showed a 32.").
    if (
      trimmed &&
      !/^#{1,6}\s/.test(trimmed) &&
      !/^\s*(\||[-*+]|\d+\.)\s?/.test(out) &&
      !out.includes("|") &&
      !/^>/.test(trimmed) &&
      !/^</.test(trimmed) &&
      !/[.!?:)]\s*$/.test(trimmed)
    ) {
      const termRe = /(?:(?<!\d)\.|[!?])(?=["')\]\s]|$)/g;
      let lastTerm = -1;
      let m: RegExpExecArray | null;
      while ((m = termRe.exec(trimmed)) !== null) lastTerm = m.index;
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

function stripInlineSourceFragments(markdown: string): { out: string; removed: number } {
  const refMatch = markdown.match(/^##\s+references\b/im);
  const body = refMatch?.index !== undefined ? markdown.slice(0, refMatch.index) : markdown;
  const references = refMatch?.index !== undefined ? markdown.slice(refMatch.index) : "";
  let removed = 0;
  const cleaned = body
    .split("\n")
    .map((line) => {
      let next = line.replace(/\s*\((?:Source|Sources?)\s*:\s*[^)]{1,240}\)/gi, () => {
        removed += 1;
        return "";
      });
      if (/^\s*(?:Source|Sources?)\s*:\s*(?!\[[^\]]+\]\(https?:\/\/)/i.test(next)) {
        removed += 1;
        return "";
      }
      next = next.replace(/^(\s*)(?:Source|Sources?)\s*:\s*(\[[^\]]+\]\(https?:\/\/[^)]+\))\s*$/i, "$1$2");
      return next
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/([.!?]){2,}/g, "$1")
        .trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return { out: `${cleaned}${references ? `\n\n${references.trimStart()}` : ""}`.trim(), removed };
}

function stripBodyNumericCitationMarkers(markdown: string): { out: string; removed: number } {
  const refMatch = markdown.match(/^##\s+references\b/im);
  const body = refMatch?.index !== undefined ? markdown.slice(0, refMatch.index) : markdown;
  const references = refMatch?.index !== undefined ? markdown.slice(refMatch.index) : "";
  const markerRe = /\s?\[(?:\d{1,3})(?:\s*(?:,|and|&|\-|–|—)\s*\d{1,3})*\](?!\s*\()/gi;
  const removed = (body.match(markerRe) || []).length;
  if (removed === 0) return { out: markdown, removed: 0 };
  const cleanedBody = body
    .replace(markerRe, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/ {2,}/g, " ");
  return { out: cleanedBody + references, removed };
}

function stripCrossDomainFallbackBullets(markdown: string, topic: string): { out: string; removed: number } {
  const topicAllowsDietaryLanguage = /\b(gluten|coeliac|celiac|wheat|bloat|bloating|ncgs|sensitivity|ibs|fodmap|diet|digestive|gastro|intestinal)\b/i.test(topic);
  if (topicAllowsDietaryLanguage) return { out: markdown, removed: 0 };

  const refMatch = markdown.match(/^##\s+references\b/im);
  const body = refMatch?.index !== undefined ? markdown.slice(0, refMatch.index) : markdown;
  const references = refMatch?.index !== undefined ? markdown.slice(refMatch.index) : "";
  const contaminatedBullet = /^\s*[-*+]\s+.*\b(?:changing\s+diet|dietary\s+change|food\s+exposure|bloating|long-term\s+restriction|restriction\s+before\s+testing|symptom\s+timing|digestive\s+mechanisms)\b.*$/i;
  let removed = 0;
  const cleanedBody = body
    .split("\n")
    .filter((line) => {
      if (!contaminatedBullet.test(line)) return true;
      removed += 1;
      return false;
    })
    .join("\n")
    .replace(/[^.!?\n]*(?:changing\s+diet|dietary\s+change|food\s+exposure|bloating|long-term\s+restriction|restriction\s+before\s+testing|symptom\s+timing|digestive\s+mechanisms)[^.!?\n]*[.!?]/gi, () => {
      removed += 1;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trimEnd();
  return { out: `${cleanedBody}${references ? `\n\n${references.trimStart()}` : ""}`.trim(), removed };
}

function stripExpertInputPlaceholders(markdown: string): { out: string; removed: number } {
  let removed = 0;
  const out = markdown
    .split("\n")
    .map((line) => {
      if (!/\[NEEDS EXPERT INPUT/i.test(line)) return line;
      removed += 1;
      if (!/\]/.test(line)) return "";
      const cleaned = line.replace(/[^.!?\n]*\[NEEDS EXPERT INPUT[^\]]*\][^.!?\n]*[.!?]?/gi, () => {
        return "";
      }).replace(/\s{2,}/g, " ").trim();
      return /^[-*+]\s*$/.test(cleaned) ? "" : cleaned;
    })
    .filter((line) => line.trim() !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { out, removed };
}

function stripAllBracketPlaceholders(markdown: string): { out: string; removed: number } {
  let removed = 0;
  const placeholderRe = /\[(?:client|service\s*business|practice|your\s*practice|your\s*business|business|brand|company|clinic)\s*name\]/gi;
  const out = markdown
    .split("\n")
    .map((line) => {
      placeholderRe.lastIndex = 0;
      if (!placeholderRe.test(line)) return line;
      placeholderRe.lastIndex = 0;
      removed += 1;
      const cleaned = line
        .replace(/[^.!?\n]*\[(?:client|service\s*business|practice|your\s*practice|your\s*business|business|brand|company|clinic)\s*name\][^.!?\n]*[.!?]?/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      return cleaned;
    })
    .filter((line) => line.trim() !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { out, removed };
}

function buildFallbackBullets(_heading: string, _body: string): string[] {
  // Returns empty array — fallback bullets were generic filler that polluted body sections.
  // The model is responsible for producing real bullets; none are injected as fallback.
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
  // Fallback table when the model fails to produce one.
  // Derives column headers and row labels directly from the section heading and topic.
  // Never uses generic placeholder rows.
  const h = (sectionHeading ?? topic).replace(/^##\s+/, "").replace(/[?!.]+$/, "").trim();

  // Strip question words to get the core noun phrase
  const stripped = h
    .replace(/^(what(?:'s| is| are)?|how(?:'s| do| does| often| many| much)?|why(?:'s)?|when(?:'s)?|which(?:'s)?|is|are|does|do|can|should|who|where)\s+/i, "")
    .replace(/^(the|a|an)\s+/i, "")
    .trim();

  const subject = stripped.charAt(0).toUpperCase() + stripped.slice(1);

  // Build rows from the topic keywords — always specific to this article
  const topicLower = topic.toLowerCase();

  // Healthcare / dental
  if (/dental|implant|dentist|tooth|teeth|oral|surgeon|periodontist|prosthodontist/.test(topicLower)) {
    return `| Provider type | Implant failure rate | Training pathway |
| --- | --- | --- |
| General practitioner | Up to 18% (Albrektsson criteria) | Introductory dental school training only |
| Board-certified specialist | 3-4% (academic/specialty settings) | ABOI/ID certification or CODA-approved residency |
| Dual-specialist team | Lowest recorded failure rates | Oral surgeon + prosthodontist combined |`;
  }

  // Legal / compliance
  if (/legal|law|compliance|regulation|contract|liability/.test(topicLower)) {
    return `| ${subject} | Key requirement | Common failure point |
| --- | --- | --- |
| Standard compliance | Meets minimum statutory requirement | Missing a single mandatory disclosure |
| Specialist review | Reviewed by qualified practitioner | Practitioner lacks domain-specific credentials |
| Full audit | All documentation verified against regulation | Outdated version of regulation applied |`;
  }

  // Finance / investment
  if (/invest|fund|portfolio|return|risk|finance|capital|revenue/.test(topicLower)) {
    return `| ${subject} | Key metric | Risk indicator |
| --- | --- | --- |
| Conservative approach | Prioritises capital preservation | Lower yield, minimal volatility |
| Balanced approach | Targets steady growth with managed risk | Moderate exposure to market cycles |
| Aggressive approach | Maximises return potential | Higher volatility, longer recovery horizon |`;
  }

  // Generic fallback — at minimum uses the topic noun in rows
  const topicNounShort = topic.replace(/[?!.]+$/, "").split(/\s+/).slice(0, 3).join(" ");
  return `| ${subject} option | Primary advantage | When to use it |
| --- | --- | --- |
| Entry-level ${topicNounShort} | Lower upfront cost or commitment | Suitable for straightforward situations |
| Mid-range ${topicNounShort} | Balance of quality and accessibility | Most common situations |
| Premium ${topicNounShort} | Highest outcome reliability | Complex or high-stakes situations |`;
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

  // Derive a topic-specific decision heading and criteria.
  // The heading references the actual topic noun so it never reads as a generic template.
  const noun = topicNoun(topic);
  const t = topic.toLowerCase();

  // Build a topic-specific heading. Use topicNoun() first for known domains.
  // For unknown topics, extract the first 3-4 meaningful words to avoid
  // the heading swallowing the full article title.
  let headingNoun = noun !== "Option"
    ? noun
    : topic
        .replace(/[?!.]+$/, "")
        .replace(/^(what|how|why|when|which|is|are|does|do|can|should)\s+/i, "")
        .split(/\s+/)
        .slice(0, 4)
        .join(" ")
        .trim();
  // Strip subtitle separators (colon, em dash, pipe) and everything after
  headingNoun = headingNoun.replace(/\s*[:—|].*$/, "").trim();
  const heading = `## How to Choose the Right ${headingNoun.charAt(0).toUpperCase() + headingNoun.slice(1)}`;
  const nounLower = noun.toLowerCase();

  // Derive criteria that reflect what someone evaluating this specific topic needs to weigh.
  // Three criteria are always topic-derived; two are universal decision-quality criteria.
  const criteria = [
    `- Confirm the category before comparing: establish what type of ${nounLower} the situation actually requires, because comparing across categories wastes time and leads to the wrong choice.`,
    `- Ask what problem each option is specifically designed to solve: a ${nounLower} that addresses the wrong problem will underperform regardless of quality or price.`,
    `- Demand specific numbers: costs, timelines, success rates, and limitations should come with concrete figures. Reject any option that answers with "it varies" or "it depends" without a range.`,
    `- Check fit against your actual constraints: budget, timeline, location, and compatibility are decision criteria, not afterthoughts. Rule out options that fail on any hard constraint first.`,
    `- Confirm the review checkpoint: ask what measurable outcome will confirm the ${nounLower} is working within a defined timeframe, and what triggers a change of plan if it is not.`,
  ];

  const block = `${heading}\n\n${criteria.join("\n")}`;

  // Insert before FAQ or Final Thoughts; otherwise before References; otherwise at end.
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

// BUILD-2026-05-29-O: References are emitted as pure markdown bullets at the
// source. No raw-HTML helpers — the preview renderer (ReactMarkdown) escapes
// raw HTML, so any <ul>/<li> string would render as literal text.
function refsToMarkdown(refs: Array<{ title: string; url?: string }>): string {
  return refs.map((ref) => {
    const title = ref.title.trim().replace(/[\[\]]/g, "");
    if (ref.url && /^https?:\/\//i.test(ref.url)) {
      return `- [${title}](${ref.url.trim()})`;
    }
    return `- ${title}`;
  }).join("\n");
}

// BUILD-2026-05-29-Q: References must be EXTERNAL CITATIONS ONLY.
// A reference without a real https?:// URL is a context-file name (e.g.
// "Deep Research Report: ...") — that's an internal document, not a citation,
// and must never appear in the public References block. Drop it.
// Dedupe by lowercased hostname (www. stripped) + pathname (trailing slash stripped).
// High-authority domain patterns for reference filtering.
// Only URLs matching these patterns appear in the References section.
// Add new patterns here as needed — regex tested against hostname (www. stripped).
const HIGH_AUTHORITY_DOMAINS = [
  // Academic databases and journals
  /pubmed\.ncbi\.nlm\.nih\.gov/, /pmc\.ncbi\.nlm\.nih\.gov/,
  /ncbi\.nlm\.nih\.gov/, /nih\.gov/, /cdc\.gov/, /who\.int/,
  /cochranelibrary\.com/, /bmj\.com/, /nejm\.org/, /thelancet\.com/,
  /jamanetwork\.com/, /nature\.com/, /sciencedirect\.com/,
  /springer\.com/, /wiley\.com/, /tandfonline\.com/,
  /journals\.sagepub\.com/, /academic\.oup\.com/, /researchgate\.net/,
  // Government and public health
  /\.gov$/, /\.gov\.uk$/, /\.nhs\.uk$/, /nhs\.uk/,
  // Academic institutions
  /\.edu$/, /\.ac\.uk$/, /\.ac\./,
  // Dental and medical professional bodies
  /ada\.org/, /aboi\.org/, /bda\.org/, /rcseng\.ac\.uk/,
  /aaoms\.org/, /perio\.org/, /aaid\.org/, /jtperio\.com/,
  /aap\.org/, /aada\.org/, /rcpsg\.ac\.uk/,
  // Reputable health information publishers
  /mayoclinic\.org/, /healthline\.com/, /medicalnewstoday\.com/,
  // Dental tourism and specialist directories (expand per client as needed)
  /dentaltourismalbania\.com/,
];

function isHighAuthorityUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return HIGH_AUTHORITY_DOMAINS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

function dedupeAndValidateRefs(
  refs: Array<{ title: string; url?: string }>,
): Array<{ title: string; url: string }> {
  const seen = new Set<string>();
  const out: Array<{ title: string; url: string }> = [];
  for (const ref of refs) {
    const title = (ref.title || "").trim();
    const rawUrl = (ref.url || "").trim();
    if (!title || !rawUrl) continue;
    if (!/^https?:\/\//i.test(rawUrl)) continue;
    // Authority filter — only keep high-authority domains in the References section.
    if (!isHighAuthorityUrl(rawUrl)) {
      console.log(`REFERENCES: dropped low-authority URL: ${rawUrl}`);
      continue;
    }
    try {
      const u = new URL(rawUrl);
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      if (!host) continue;
      const path = u.pathname.replace(/\/+$/, "");
      const key = `${host}${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title, url: rawUrl });
    } catch {
      continue;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// extractContextFileReferences
// The ONLY source for References. Extracts URLs from the uploaded context
// files, parses Works Cited titles, filters for authority + relevance,
// and never emits unlinked entries.
// No brain URLs, no DB fallbacks — per explicit product rule.
// ─────────────────────────────────────────────────────────────────────────────
function extractContextFileReferences(
  contextFiles: Array<{ name: string; content: string }>,
  topic: string,
): Array<{ title: string; url: string }> {
  // Domains to always drop (social media, e-commerce, low-credibility)
  const SKIP_HOSTS = new Set([
    "reddit.com", "twitter.com", "x.com", "facebook.com", "instagram.com",
    "linkedin.com", "youtube.com", "amazon.com", "ebay.com", "etsy.com",
    "lifetips.alibaba.com", "alibaba.com",
  ]);
  // Product-listing URL pattern — drop specific product pages from brand sites
  const PRODUCT_URL_RE = /\/(us|uk|in|de|fr|jp|ca)\/(\d{4}\w+|[\w-]+-\w{6,8})\.html/i;

  // Authority tiers — tier 1 = academic/gov, tier 2 = reputable industry
  const AUTH_TIER_1: RegExp[] = [
    /pmc\.ncbi/, /pubmed\.ncbi/, /ncbi\.nlm\.nih\.gov/, /\.nih\.gov/,
    /\.gov$/, /\.gov\./, /\.edu$/, /\.ac\.uk/, /\.ac\./,
    /researchgate\.net/, /pubs\.acs\.org/, /acs\.org/,
    /sciencedirect\.com/, /springer\.com/, /tandfonline\.com/,
    /wiley\.com/, /nature\.com/, /bmj\.com/, /thelancet\.com/,
    /jamanetwork\.com/, /journals\.sagepub\.com/, /cochranelibrary\.com/,
    /academic\.oup\.com/, /ft\.tul\.cz/, /journalspress\.com/,
    /aatcc\.org/, /astm\.org/, /iso\.org/,
  ];
  const AUTH_TIER_2: RegExp[] = [
    /shell\.com/, /nike\.com/, /adidas\.com/, /darongtester\.com/,
    /speed-queen\./, /speedqueen\./, /canvasetc\.com/, /spandexbyyard\.com/,
    /szonei/, /iyunai/, /wooter/, /yunai/, /fibres.*textile/,
  ];

  type Candidate = { title: string; url: string; tier: number; score: number };
  const candidates: Candidate[] = [];
  const urlSeen = new Set<string>();
  const topicTokens = topic.toLowerCase().split(/\s+/).filter(t => t.length >= 4);

  const processEntry = (rawUrl: string, rawTitle: string) => {
    const url = rawUrl.trim().replace(/[)\].,;]+$/, "");
    if (!url || !/^https?:\/\//i.test(url)) return;
    const key = url.toLowerCase();
    if (urlSeen.has(key)) return;
    let host: string;
    try { host = new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
    catch { return; }
    if (SKIP_HOSTS.has(host)) return;
    if (PRODUCT_URL_RE.test(url)) return;
    urlSeen.add(key);
    const tier = AUTH_TIER_1.some(re => re.test(host)) ? 1
      : AUTH_TIER_2.some(re => re.test(host)) ? 2 : 3;
    const haystack = `${host} ${url} ${rawTitle}`.toLowerCase();
    const score = topicTokens.reduce((s, t) => s + (haystack.includes(t) ? 1 : 0), 0);
    const title = (rawTitle || host).slice(0, 120).trim();
    candidates.push({ title, url, tier, score });
  };

  for (const cf of contextFiles) {
    const text = cf.content || "";
    const lines = text.split("\n");
    for (const line of lines) {
      // Markdown link: [Title](URL)
      const mdRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = mdRe.exec(line)) !== null) {
        processEntry(m[2], m[1]);
      }
      // Works Cited format: "N. Title - Source, accessed on DATE, URL"
      const bareUrlMatch = line.match(/(https?:\/\/[^\s,;)\]]+)/);
      if (bareUrlMatch) {
        // Title = text before "accessed on" and before the URL
        let title = line
          .replace(bareUrlMatch[0], "")
          .replace(/,?\s*accessed\s+on\s+\w+\s+\d+,?\s+\d{4}/gi, "")
          .replace(/^\d+\.\s*/, "")
          .replace(/\t/g, " ")
          .trim()
          .replace(/,\s*$/, "")
          .replace(/\.\s*$/, "")
          .trim();
        // Strip trailing " - SourceName" if it would duplicate the URL hostname
        try {
          const host = new URL(bareUrlMatch[0]).hostname.replace(/^www\./, "").split(".")[0];
          title = title.replace(/ - [^-]+$/i, "").trim();
        } catch { /* skip */ }
        processEntry(bareUrlMatch[0], title);
      }
    }
  }

  // Sort: tier 1 first, then by relevance score descending
  candidates.sort((a, b) => a.tier - b.tier || b.score - a.score);

  // Deduplicate by host+path, take up to 8
  const pathSeen = new Set<string>();
  const out: Array<{ title: string; url: string }> = [];
  for (const c of candidates) {
    try {
      const u = new URL(c.url);
      const pathKey = u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "");
      if (pathSeen.has(pathKey)) continue;
      pathSeen.add(pathKey);
      out.push({ title: c.title, url: c.url });
    } catch { /* skip */ }
    if (out.length >= 8) break;
  }
  return out;
}

function injectReferences(markdown: string, units: BrainUnit[], sourceReferences: SourceReference[] = []): string {
  // Always replace any existing ## References section — the model sometimes
  // emits empty bullets or low-quality inline references that must be replaced
  // with the validated context-file sources.
  const stripped = markdown.replace(
    /^##\s+References?[\s\S]*$/im,
    ""
  ).trimEnd();
  const references = dedupeAndValidateRefs(sourceReferences).slice(0, 8);
  if (references.length === 0) return stripped;
  return `${stripped}\n\n## References\n\n${refsToMarkdown(references)}\n`;
}

function sectionLinkLooksRelevant(anchor: string, url: string, sectionText: string, topic: string): boolean {
  if (!/^https?:\/\//i.test(url)) return true;
  const destinationHits = urlTopicHits(url, `${topic} ${anchor}`);
  if (!destinationHits.some((token) => !WEAK_URL_TOKENS.has(token)) && destinationHits.length < 2) return false;
  const anchorTokens = [...tokenize(anchor)].filter((t) => t.length >= 5);
  if (anchorTokens.length === 0) return false;
  const local = `${topic} ${sectionText}`.toLowerCase();
  return anchorTokens.some((token) => local.includes(token));
}

function stripMismatchedInlineLinks(markdown: string, topic: string): { out: string; removed: number } {
  const lines = markdown.split("\n");
  let removed = 0;
  const out: string[] = [];
  let sectionBuffer: string[] = [];
  let inReferences = false;
  const flush = () => {
    if (sectionBuffer.length === 0) return;
    const sectionText = sectionBuffer.join("\n");
    out.push(...sectionBuffer.map((line) =>
      line.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (match, anchor: string, url: string) => {
        if (sectionLinkLooksRelevant(anchor, url, sectionText, topic)) return match;
        removed += 1;
        return anchor;
      })
    ));
    sectionBuffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+references\b/i.test(line)) {
      flush();
      out.push(line);
      sectionBuffer = [];
      inReferences = true;
      continue;
    }
    if (inReferences) { out.push(line); continue; }
    if (/^##\s+/.test(line)) flush();
    sectionBuffer.push(line);
  }
  flush();
  return { out: out.join("\n"), removed };
}

function trustedFallbackSources(topic: string, sourceReferences: SourceReference[] = []): BrainUrl[] {
  // Use URLs extracted from the article's own sourceReferences (context files + supplied references) first.
  // This makes the fallback topic-agnostic — it works for any subject.
  const fromContext: BrainUrl[] = sourceReferences
    .filter((r) => r.url && /^https?:\/\//i.test(r.url))
    .slice(0, 3)
    .map((r) => ({ title: r.title, url: r.url! }));
  if (fromContext.length > 0) return fromContext;
  // No context URLs available — return empty so the caller skips injection.
  return [];
}

function ensureTrustedReferences(markdown: string, topic: string, sourceReferences: SourceReference[] = []): string {
  if (/^##\s+references/im.test(markdown)) return markdown;
  const sources = dedupeAndValidateRefs(trustedFallbackSources(topic, sourceReferences));
  if (sources.length > 0) {
    return `${markdown.trimEnd()}\n\n## References\n\n${refsToMarkdown(sources)}\n`;
  }
  // No real source URLs available — do not inject a placeholder.
  // A missing References section is honest; a fake one is misleading.
  // Upload context files containing real URLs to populate this section.
  return markdown;
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

/* ── deterministic structural normalisers (BUILD-2026-05-29-G):
       table unwrap, citation-title hygiene, Rule-5 hedge repair ────────── */

function stripFileExtension(name: string): string {
  return (name || "").replace(/\.(docx?|txt|pdf|md|html?|rtf|odt|csv)$/i, "");
}

function firstMeaningfulLine(content: string | null | undefined): string {
  if (!content) return "";
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[#>*\-|`]/.test(line)) continue;          // skip headings/lists/tables/quotes/code fences
    if (line.length < 5 || line.length > 140) continue;
    return line;
  }
  return "";
}

function cleanReferenceTitle(rawName: string | null | undefined, content?: string | null): string {
  const fromContent = firstMeaningfulLine(content);
  if (fromContent) return fromContent;
  return stripFileExtension((rawName || "").trim())
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect pipe-table sequences that landed inside list items or bullet
 * indents, strip the list markers + leading indent, and guarantee a blank
 * line on both sides of the table block so the client-side markdown parser
 * renders the table as a true top-level <table> sibling (never nested
 * inside <li>). Triggers only when the second line of a candidate run is a
 * pipe-table separator (`|---|---|`), so prose with stray pipes is left
 * alone.
 */
function unwrapTablesFromLists(markdown: string): { out: string; unwrapped: number } {
  const lines = markdown.split("\n");
  const stripPrefix = (l: string) => l.replace(/^\s*[-*+]\s+/, "").replace(/^\s+/, "");
  const isRow = (l: string) => /\|.*\|/.test(stripPrefix(l));
  const isSep = (l: string) => {
    const s = stripPrefix(l);
    return /^\|?[\s:\-|]+\|[\s:\-|]+\|?$/.test(s) && s.includes("-");
  };
  const out: string[] = [];
  let unwrapped = 0;
  let i = 0;
  while (i < lines.length) {
    if (isRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1])) {
      let j = i;
      const original: string[] = [];
      const block: string[] = [];
      while (j < lines.length && isRow(lines[j])) {
        original.push(lines[j]);
        block.push(stripPrefix(lines[j]));
        j++;
      }
      const wasNested = original.some(
        (l) => /^\s*[-*+]\s+\|/.test(l) || /^\s+\|/.test(l),
      );
      if (out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
      out.push(...block);
      if (j < lines.length && lines[j].trim() !== "") out.push("");
      if (wasNested) unwrapped++;
      i = j;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return { out: out.join("\n"), unwrapped };
}

/**
 * Rule-5 repair gate: exactly ONE low-latency micro-call that rewrites
 * lintRule5-flagged hedge sentences ("typically / usually / varies / depends
 * on" with no number in the same sentence) into direct factual statements.
 * Caller invokes this at most once per section and re-lints afterwards
 * without invoking again — no loop, bounded blast radius.
 */
async function repairHedgeSentences(
  sectionContent: string,
  flagged: string[],
  fallbackModel: string,
): Promise<string> {
  if (flagged.length === 0) return sectionContent;
  const numbered = flagged.map((s, idx) => `${idx + 1}. ${s}`).join("\n");
  const system = `You rewrite hedged sentences into direct, factual statements.
Rules:
- Strip vague qualifiers ("typically", "usually", "varies", "depends on") unless followed by a specific number in the same sentence.
- Keep the same factual scope; never invent statistics, percentages, or numbers that are not in the original.
- If the original has no number, produce a direct claim without inventing one.
- Preserve British English and the surrounding tone.
- Output ONLY the rewritten sentences, one per line, numbered identically to the input. No preamble, no commentary, no markdown fences.`;
  const user = `Rewrite each numbered sentence below into a direct, un-hedged statement:\n\n${numbered}`;
  let rewritten = "";
  try {
    rewritten = await callModel(system, user, "google/gemini-2.5-flash-lite", 500);
  } catch (e) {
    try {
      rewritten = await callModel(system, user, fallbackModel, 500);
    } catch (e2) {
      console.warn("LINT-R5 repair: micro-call failed (non-fatal):", e2);
      return sectionContent;
    }
  }
  const repaired = new Map<number, string>();
  for (const raw of rewritten.split("\n")) {
    const m = raw.match(/^\s*(\d+)[.)]\s*(.+?)\s*$/);
    if (!m) continue;
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < flagged.length) repaired.set(idx, m[2]);
  }
  if (repaired.size === 0) return sectionContent;
  let out = sectionContent;
  let replaced = 0;
  for (let i = 0; i < flagged.length; i++) {
    const next = repaired.get(i);
    if (!next || next === flagged[i]) continue;
    if (out.includes(flagged[i])) {
      out = out.replace(flagged[i], next);
      replaced++;
    }
  }
  if (replaced > 0) console.log(`LINT-R5: repaired ${replaced}/${flagged.length} hedge sentence(s).`);
  return out;
}

function ensureMinimumTables(markdown: string, topic: string, targetWords: number): string {
  // Require 1 table per 500 words (spec), capped at 2 for fallback injection.
  // The model generates real tables; this only fills the gap when the model misses the minimum.
  const required = Math.min(2, Math.max(1, Math.round(targetWords / 500)));
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
  if (inserted > 0) console.log(`TABLES: ensureMinimumTables inserted ${inserted} topic-specific table(s); required=${required}; before=${current}.`);
  if (current + inserted < required) console.warn(`TABLES: ensureMinimumTables could not meet required count; required=${required}; before=${current}; inserted=${inserted}; topic="${topic}".`);
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
  const PLACEHOLDER_INNER = "practice\\s*name|your\\s*practice|your\\s*business\\s*name|clinic\\s*name|business\\s*name|brand\\s*name|company\\s*name";
  const placeholderSentenceRe = new RegExp(`[^.!?\\n]*\\[(?:${PLACEHOLDER_INNER})\\][^.!?\\n]*[.!?]?`, "gi");
  let out = markdown.replace(placeholderSentenceRe, "");
  // Replace preposition + placeholder ("at [PRACTICE NAME]" → "at the practice")
  out = out.replace(
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

function collectChunkUrls(chunks: RetrievedChunk[]): BrainUrl[] {
  const out: BrainUrl[] = [];
  const seen = new Set<string>();
  const re = /https?:\/\/[^\s)<>"'\]]+/g;
  for (const c of chunks) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(c.content || "")) !== null) {
      const url = m[0].replace(/[)\]\.,;]+$/, "");
      if (seen.has(url)) continue;
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        seen.add(url);
        out.push({ url, title: host });
      } catch { /* skip */ }
    }
  }
  return out;
}

function scoreTextForTopic(text: string, topic: string, sectionHeading = ""): number {
  const tokens = [...tokenize(`${topic} ${sectionHeading}`)].filter((t) => t.length >= 5).slice(0, 16);
  const haystack = text.toLowerCase();
  return tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
}

const WEAK_URL_TOKENS = new Set(["dental", "dentist", "dentists", "clinic", "clinics", "implant", "implants"]);

function urlTopicHits(url: string, text: string): string[] {
  try {
    const parsed = new URL(url);
    const urlText = `${parsed.hostname} ${decodeURIComponent(parsed.pathname)}`.toLowerCase();
    return [...tokenize(text)].filter((token) => token.length >= 5 && urlText.includes(token));
  } catch {
    return [];
  }
}

function filterUrlsForTopic(urls: BrainUrl[], topic: string): BrainUrl[] {
  const topicTokens = [...tokenize(topic)].filter((t) => t.length >= 5);
  if (topicTokens.length === 0) return urls;
  return urls.filter((u) => {
    const hits = urlTopicHits(u.url, topic);
    return hits.some((token) => !WEAK_URL_TOKENS.has(token)) || hits.length >= 2;
  });
}

function hasStrongTopicAnchor(text: string, topic: string): boolean {
  const anchors = [...tokenize(topic)]
    .filter((t) => t.length >= 6)
    .filter((t) => !/^(because|should|could|would|people|reason|causes?|choosing|choose|belly)$/.test(t));
  if (anchors.length === 0) return true;
  const haystack = text.toLowerCase();
  return anchors.some((token) => haystack.includes(token));
}

async function retrieveContextDocumentSnippets(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  topic: string,
  sectionHeading: string,
): Promise<Array<{ content: string; sourceTitle: string; context_document_id: string }>> {
  const { data, error } = await supabase
    .from("context_documents")
    .select("id, file_name, content")
    .limit(100);
  if (error) {
    console.warn(`CONTEXT: document lookup failed for "${sectionHeading}":`, error.message);
    return [];
  }
  return ((data || []) as ContextDocumentRow[])
    .map((doc) => ({ doc, score: scoreTextForTopic(`${doc.file_name}\n${doc.content || ""}`, topic, sectionHeading) }))
    .filter((row) => row.score >= 2 && hasStrongTopicAnchor(`${row.doc.file_name}\n${row.doc.content || ""}`, topic))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ doc }) => ({
      content: (doc.content || "").slice(0, 2200),
      sourceTitle: doc.file_name,
      context_document_id: doc.id,
    }));
}

async function collectSourceReferences(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  units: BrainUnit[],
  chunks: RetrievedChunk[],
): Promise<SourceReference[]> {
  const references: SourceReference[] = [];
  const seen = new Set<string>();
  const add = (title?: string | null, url?: string | null) => {
    const cleanTitle = (title || "").trim();
    const rawUrl = (url || "").trim();
    const cleanUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : "";
    if (!cleanTitle && !cleanUrl) return;
    const key = `${cleanUrl || "file"}:${cleanTitle || cleanUrl}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    references.push({ title: cleanTitle || cleanUrl, url: cleanUrl || undefined });
  };
  const addUrlsFromText = (text?: string | null) => {
    for (const link of extractUrls(text || "")) add(link.title, link.url);
  };

  units.forEach((u) => addUrlsFromText(`${u.summary || ""}\n${u.full_text || ""}`));
  chunks.forEach((c) => addUrlsFromText(c.content));

  const brainFileIds = new Set<string>();
  const contextDocumentIds = new Set<string>();
  units.forEach((u) => { if (u.source_file_id) brainFileIds.add(u.source_file_id); });
  chunks.forEach((c) => {
    if (c.brain_file_id) brainFileIds.add(c.brain_file_id);
    if (c.context_document_id) contextDocumentIds.add(c.context_document_id);
  });

  if (brainFileIds.size > 0) {
    const { data, error } = await supabase
      .from("brain_files")
      .select("id, title, file_url")
      .in("id", [...brainFileIds]);
    if (error) console.warn("REFERENCES: brain_files source lookup failed:", error.message);
    (data || []).forEach((file: { title?: string | null; file_url?: string | null }) => {
      const title = cleanReferenceTitle(file.title);
      if (!/\b(deep\s+research|seo\s+content\s+research\s+report|research\s+report)\b/i.test(title)) {
        add(title, file.file_url);
      }
    });
  }

  if (contextDocumentIds.size > 0) {
    const { data, error } = await supabase
      .from("context_documents")
      .select("id, file_name, content")
      .in("id", [...contextDocumentIds]);
    if (error) console.warn("REFERENCES: context_documents source lookup failed:", error.message);
    (data || []).forEach((doc: { file_name?: string | null; content?: string | null }) => addUrlsFromText(doc.content));
  }

  return references;
}

async function fallbackContextReferencesForTopic(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  topic: string,
): Promise<SourceReference[]> {
  const tokens = [...tokenize(topic)].filter((t) => t.length >= 5).slice(0, 8);
  if (tokens.length === 0) return [];
  const { data, error } = await supabase
    .from("context_documents")
    .select("id, file_name, content")
    .limit(100);
  if (error) {
    console.warn("REFERENCES: fallback context lookup failed:", error.message);
    return [];
  }
  const scored = ((data || []) as ContextDocumentRow[])
    .map((doc) => {
      const haystack = `${doc.file_name || ""}\n${(doc.content || "").slice(0, 3000)}`.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { doc, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  const refs: SourceReference[] = [];
  const seen = new Set<string>();
  for (const { doc } of scored.slice(0, 3)) {
    for (const link of extractUrls(doc.content || "")) {
      const key = link.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ title: link.title, url: link.url });
    }
  }
  if (refs.length > 0) console.log(`REFERENCES: fallback matched ${refs.length} context document(s) for topic tokens.`);
  return refs;
}

function attachInlineCitations(markdown: string, urls: BrainUrl[]): { out: string; attached: number } {
  if (urls.length === 0) return { out: markdown, attached: 0 };
  const lines = markdown.split("\n");
  let urlIdx = 0;
  let attached = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (!m) continue;
    if (STRUCT_SKIP_RE.test(m[1])) continue;
    let endIdx = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^##\s+/.test(lines[j])) { endIdx = j; break; }
    }
    const sectionBody = lines.slice(i + 1, endIdx).join("\n");
    if (/\]\(https?:\/\//.test(sectionBody)) continue; // already cited
    // Cycle through URLs so every body section gets at least one citation,
    // even when fewer URLs than sections are available.
    const u = urls[urlIdx % urls.length];
    urlIdx++;
    let pEnd = i + 1;
    while (pEnd < endIdx && lines[pEnd].trim() !== "") pEnd++;
    const citationLine = `\nSource: [${u.title}](${u.url})`;
    lines.splice(pEnd, 0, citationLine);
    attached++;
  }
  return { out: lines.join("\n"), attached };
}

// attachContextSourceNotes removed (BUILD-2026-05-29-G):
// the prose-leak path that appended "Source: filename.docx" lines into body
// paragraphs has been deleted. Context-document references are now rendered
// EXCLUSIVELY in the footer References section via injectReferences, after
// filename sanitisation via cleanReferenceTitle (strips .docx/.txt/.pdf and
// prefers the first meaningful line of the file as the human-readable title).

// ─────────────────────────────────────────────────────────────────────────────
// Entity Bridge Rule
// Injects one editorial paragraph connecting the informational topic to the
// brand's commercial offer. Placed after the first H2 section that contains
// team/league/season/equipment context. Never forced into technical sections.
// ─────────────────────────────────────────────────────────────────────────────

interface EntityBridgeConfig {
  brandName: string;       // e.g. "Big League Shirts"
  collectionUrl: string;   // e.g. "/collections/hockey" or full URL
  productLabel: string;    // e.g. "custom hockey jerseys"
  sportLabel: string;      // e.g. "hockey"
}

// Trigger words — if an H2 heading or its body contains any of these,
// the bridge paragraph is inserted after that section.
const BRIDGE_TRIGGER_WORDS = [
  "team", "teams", "league", "leagues", "season", "seasons",
  "players", "player", "coach", "coaches", "captain",
  "equipment", "gear", "kit", "uniform", "uniforms", "jersey", "jerseys",
  "organis", "organiz", "tournament", "recreational", "youth",
  "beer league", "club", "division", "roster",
];

// Context phrases — vary the bridge paragraph based on section context
function buildBridgeParagraph(
  sectionHeading: string,
  topic: string,
  cfg: EntityBridgeConfig
): string {
  const h = sectionHeading.toLowerCase();
  const t = topic.toLowerCase().replace(/[?!.]+$/, "").trim();

  // Detect context from heading to write a natural transition
  const isEquipment = /equipment|gear|kit|uniform|jersey/.test(h);
  const isLeague = /league|tournament|recreational|organis|organiz/.test(h);
  const isSeason = /season|schedule|calendar/.test(h);
  const isTeam = /team|players|roster|coach|captain/.test(h);

  let opener: string;
  if (isEquipment) {
    opener = `If your team is sourcing kit for an upcoming ${cfg.sportLabel} season,`;
  } else if (isLeague) {
    opener = `If you're organising a recreational ${cfg.sportLabel} league or running a tournament,`;
  } else if (isSeason) {
    opener = `As you plan your ${cfg.sportLabel} season,`;
  } else if (isTeam) {
    opener = `If you're coaching a youth ${cfg.sportLabel} team or captaining a club side,`;
  } else {
    opener = `If you're involved in organising or running a ${cfg.sportLabel} team,`;
  }

  // Derive a short sport-specific use case from the topic
  const linkText = `Browse custom ${cfg.sportLabel} jerseys here`;

  return `${opener} ${cfg.brandName} offers fully customised ${cfg.productLabel} with no minimum order and a three-week turnaround — whether for a beer league, a youth programme, or a showcase team. [${linkText}.](${cfg.collectionUrl})`;
}

function injectEntityBridge(
  markdown: string,
  topic: string,
  cfg: EntityBridgeConfig
): string {
  const lines = markdown.split("\n");
  const skipSections = /tl;?dr|quick\s*tips|frequently\s*asked|faq|final\s*thoughts|references|sources|in\s*this\s*article|how\s*to\s*choose/i;

  // Find H2 sections and their body text
  const h2Indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) h2Indices.push(i);
  }

  // Already has a bridge — don't double-inject
  if (markdown.includes(cfg.brandName) && markdown.includes(cfg.collectionUrl)) {
    return markdown;
  }

  for (let h = 0; h < h2Indices.length; h++) {
    const headingLine = lines[h2Indices[h]];
    const heading = headingLine.replace(/^##\s+/, "").trim();

    // Skip structural sections
    if (skipSections.test(heading)) continue;

    // Get body text for this section
    const bodyStart = h2Indices[h] + 1;
    const bodyEnd = h + 1 < h2Indices.length ? h2Indices[h + 1] : lines.length;
    const bodyText = lines.slice(bodyStart, bodyEnd).join(" ").toLowerCase();

    // Check if heading or body contains trigger words
    const hasTrigger = BRIDGE_TRIGGER_WORDS.some(
      (w) => heading.toLowerCase().includes(w) || bodyText.includes(w)
    );

    if (hasTrigger) {
      // Insert bridge paragraph after the last non-empty line of this section
      const bridgeParagraph = buildBridgeParagraph(heading, topic, cfg);
      const insertAt = bodyEnd;
      lines.splice(insertAt, 0, "", bridgeParagraph, "");
      console.log(`ENTITY BRIDGE: injected after section "${heading}"`);
      return lines.join("\n");
    }
  }

  // No trigger section found — append before Final Thoughts if it exists
  const finalIdx = lines.findIndex((l) => /^##\s+final\s*thoughts/i.test(l));
  const bridgeParagraph = buildBridgeParagraph("", topic, cfg);
  if (finalIdx > 0) {
    lines.splice(finalIdx, 0, "", bridgeParagraph, "");
  } else {
    lines.push("", bridgeParagraph);
  }
  console.log("ENTITY BRIDGE: injected before Final Thoughts (no trigger section found)");
  return lines.join("\n");
}

function enforceOpeningLength(markdown: string): string {
  const h1 = markdown.match(/^#\s+.+$/m);
  if (!h1 || h1.index === undefined) return markdown;
  const start = h1.index + h1[0].length;
  const nextH2 = markdown.slice(start).search(/^##\s+/m);
  const end = nextH2 >= 0 ? start + nextH2 : markdown.length;
  const opening = markdown.slice(start, end).trim();
  if (!opening) return markdown;
  const compact = opening
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
  const trimmed = trimToWordCount(compact, 85);
  return `${markdown.slice(0, start).trimEnd()}\n\n${trimmed}\n\n${markdown.slice(end).trimStart()}`.trim();
}

// Normalise the Quick Tips section into exactly three clean blockquote tips.
// The model variously emits intro sentences, quoted platitudes, bullet lists,
// and blockquotes — sometimes all four. This pass deterministically:
//  1. collects every candidate tip line (blockquote, bullet, or sentence)
//  2. strips wrapping quotes, "Tip N:" prefixes, and bold labels
//  3. drops meta/intro lines ("...with these quick tips", lines ending in ":")
//  4. prefers concrete tips (numbers, temperatures, durations) over platitudes
//  5. emits the best three as "> tip" blockquotes (renders as cards in both paths)
function normaliseQuickTipsContent(content: string): string {
  const lines = content.split("\n");
  const candidates: Array<{ text: string; order: number }> = [];
  let order = 0;
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue; // headings
    if (/^!\[/.test(line)) continue; // images
    if (/^\|/.test(line)) continue; // tables
    line = line.replace(/^>\s*/, "").replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "").trim();
    if (!line) continue;
    // Strip "Tip N:" prefixes and leading bold labels
    line = line.replace(/^\*{0,2}Tip\s*\d+\s*:?\*{0,2}\s*/i, "");
    line = line.replace(/^\*\*[^*]+\*\*\s*:?\s*/, "");
    // Strip wrapping straight/curly quotes
    line = line.replace(/^["'\u201c\u201d\u2018\u2019\s]+/, "").replace(/["'\u201c\u201d\u2018\u2019\s]+$/, "").trim();
    if (!line) continue;
    // Drop meta/intro lines, not real tips
    if (/quick\s*tips?/i.test(line)) continue;
    if (/^(here are|these are|the following|in this section|below are|keep reading|let's|remember)\b/i.test(line)) continue;
    if (/:$/.test(line)) continue;
    if (line.split(/\s+/).length < 4) continue;
    if (!/[.!?]$/.test(line)) line = `${line}.`;
    candidates.push({ text: line, order: order++ });
  }
  if (candidates.length === 0) return content; // safety: leave untouched
  // Dedupe case-insensitively
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const k = c.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Concrete tips (numbers, temperatures, durations, percentages) outrank platitudes
  const score = (s: string) =>
    (/\d/.test(s) ? 2 : 0) +
    (/\u00b0|%|hour|minute|second|cycle|degrees?\b/i.test(s) ? 1 : 0) +
    (/^(avoid|never|always|use|verify|wait|check|keep|air[- ]dry|wash|set|turn)\b/i.test(s) ? 1 : 0);
  const chosen = [...unique]
    .sort((a, b) => score(b.text) - score(a.text) || a.order - b.order)
    .slice(0, 3)
    .sort((a, b) => a.order - b.order);
  return chosen.map((c) => `> ${c.text}`).join("\n\n");
}

function enforceFinalThoughtsParagraphs(markdown: string): string {
  const re = /(^##\s+final\s*thoughts\s*\n)([\s\S]*?)(?=^##\s+|$(?![\r\n]))/im;
  const m = markdown.match(re);
  if (!m) return markdown;
  const rawBody = m[2]
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!rawBody) return markdown;
  // Protect URLs and markdown links: domain dots must never be treated as
  // sentence boundaries (previously split "site.com" URLs across paragraphs).
  const ftUrls: string[] = [];
  const body = rawBody.replace(/\[[^\]]*\]\(\s*https?:\/\/[^)\s]+\s*\)|https?:\/\/[^\s)]+/g, (u) => {
    ftUrls.push(u);
    return `\x00URL${ftUrls.length - 1}\x00`;
  });
  const restoreFtUrls = (s: string) => s.replace(/\x00URL(\d+)\x00/g, (_x, i) => ftUrls[Number(i)] ?? "");
  const sentences = body.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g)?.map((s) => restoreFtUrls(s).trim()).filter(Boolean) ?? [restoreFtUrls(body)];
  const first = trimToWordCount(sentences.slice(0, Math.ceil(sentences.length / 2)).join(" "), 65);
  const second = trimToWordCount(sentences.slice(Math.ceil(sentences.length / 2)).join(" ") || sentences.slice(-1).join(" "), 65);
  const rebuilt = [first, second].filter(Boolean).join("\n\n");
  return markdown.replace(re, `${m[1]}\n${rebuilt}\n\n`);
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
  retrievedChunks?: RetrievedChunk[];
  retrievedKnowledge?: Array<{ content: string; sourceTitle?: string | null }>;
  allowedSourceUrls?: Array<{ url: string; title: string }>;
  contextFiles?: Array<{ name: string; content: string }>;
  toneProfile?: { summary: string | null; characteristics: Record<string, string>; example_phrases: string[] | null } | null;
  valuePromiseBlock?: string;
  gapKeywordBlock?: string;
}) {
  const assembled = assembleSectionPrompt({
    businessType: input.businessType,
    mappedUnit: input.mappedUnit,
    audienceSentence: input.audienceSentence,
    publicationDestination: input.publicationDestination,
    section: input.section,
    surroundingContext: input.surroundingContext,
    articleTitle: input.articleTitle,
    allowedSourceUrls: input.allowedSourceUrls,
    retrievedKnowledge: input.retrievedKnowledge,
    contextFiles: input.contextFiles,
    toneProfile: input.toneProfile,
    valuePromiseBlock: input.valuePromiseBlock,
    gapKeywordBlock: input.gapKeywordBlock,
  });
  const isBody = input.section.type === "body";
  // Scale token budget with the word budget so the model writes to the right length.
  // Floor at 600 (enough for a concise 90-word section), ceiling at 2400.
  const tokenBudget = isBody
    ? Math.max(800, Math.min(3200, Math.round(input.sectionBudgetWords * 2.5)))
    : input.section.kind === "tldr" ? 200 : 900;
  let content: string;
  if (isBody && input.businessType === "healthcare-clinical") {
    // Clinical writer uses its own prompt; append the same atomic-structure +
    // inline-source-link contract so healthcare articles match parity.
    const allowed = (input.allowedSourceUrls || []).filter((s) => s && s.url && /^https?:\/\//i.test(s.url)).slice(0, 8);
    const sourceBlock = allowed.length > 0
      ? `\n\nINLINE SOURCE LINK (mandatory): Include exactly ONE inline markdown link "[anchor text](URL)" in this section, choosing the most relevant URL from the list below. Anchor must be a natural noun phrase from your prose. Never invent URLs.\nALLOWED SOURCES:\n${allowed.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join("\n")}`
      : `\n\nINLINE SOURCE LINK: No allow-listed URLs are available; do not insert inline links — the system will list context documents in the References section.`;
    const atomicBlock = `\n\nATOMIC SECTION STRUCTURE (mandatory): Write exactly one standalone answer paragraph (1-3 sentences) that fully answers the heading, then a blank line, then exactly 3 markdown bullets ("- "), each one concrete and ≤22 words. Nothing else.`;
    // BUILD-2026-05-29-I: hard ban on passive AI filler in clinical body prose.
    const noFillerBlock = `\n\nCRITICAL — NO PASSIVE FILLER: You are completely forbidden from writing soft, defensive AI filler phrases such as "typically symptoms of", "may experience", "can experience", "results from a range of factors", "is often caused by", "is generally considered", "plays a role in", "a variety of", "a range of", "a number of", "in some cases", "for many people", "it is important to note", "it is worth noting". Every statement must be direct, authoritative, and isolated to a concrete data node from the uploaded context files, mapped unit, or retrieved chunks. If the fact is not in the supplied evidence, write [NEEDS EXPERT INPUT] instead of generating a hedged sentence.`;
    const clinicalSystem = CLINICAL_SYSTEM_PROMPT_HEALTHCARE + atomicBlock + noFillerBlock + sourceBlock;
    content = (await callClinicalWriter(clinicalSystem, buildClinicalUserMessage({
      mappedUnit: input.mappedUnit,
      audienceSentence: input.audienceSentence,
      publicationDestination: input.publicationDestination,
      section: input.section,
      articleTitle: input.articleTitle,
      retrievedChunks: input.retrievedChunks,
      targetWordCount: input.sectionBudgetWords,
      contextFiles: input.contextFiles,
    }), tokenBudget)).trim();
  } else {
    content = (await callModel(assembled.system, assembled.user, input.model, tokenBudget)).trim();
  }
  if (isBody) {
    // Trim ceiling is 1.25× the budget to give the model room to fill the
    // target without being cut exactly at the budget line.
    const budgetCeil = Number.isFinite(input.sectionBudgetWords) && input.sectionBudgetWords > 0
      ? Math.round(input.sectionBudgetWords * 1.25)
      : 600;
    content = trimSectionToBudget(content, budgetCeil);
  }
  const needsExpertInput = /^\[NEEDS EXPERT INPUT\]\s*$/i.test(content);
  let ruleFlags = needsExpertInput ? [] : lintRule5(content);

  // RULE-5 REPAIR GATE (BUILD-2026-05-29-G): exactly ONE targeted micro-call
  // to strip un-numericized hedges from body sections. Re-lint after repair
  // but do NOT invoke the repair again — no loop, bounded blast radius.
  if (isBody && ruleFlags.length > 0) {
    const repaired = await repairHedgeSentences(content, ruleFlags, input.model);
    if (repaired !== content) {
      content = repaired;
      ruleFlags = lintRule5(content);
    }
  }

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

const BUILD_MARKER = "BUILD-2026-05-29-M proprietary-generate-article reference-link-guards";
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

    // Build a value promise block to inject into every section prompt.
    // Ensures the model writes to the specific outcomes the reader expects.
    const valuePromiseBlock = body.valuePromiseClaims && body.valuePromiseClaims.length > 0
      ? `VALUE PROMISES — the reader expects ALL of these specific outcomes. Every section must directly address at least one:\n${body.valuePromiseClaims.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n")}`
      : "";

    // Competition gaps + target keywords — secondary guidance for outline and sections.
    const gapInsightsList = (body.gapInsights || []).filter((g: string) => g && g.trim());
    const keywordsList = (body.keywords || []).filter((k: string) => k && k.trim()).slice(0, 10);
    const gapKeywordBlock = [
      gapInsightsList.length > 0
        ? `COMPETITOR GAPS — top-ranking competitors fail to cover these angles:\n${gapInsightsList.map((g: string, i: number) => `${i + 1}. ${g}`).join("\n")}`
        : "",
      body.gapAnalysis && body.gapAnalysis.trim()
        ? `COMPETITION ANALYSIS NOTES:\n${body.gapAnalysis.trim().slice(0, 2000)}`
        : "",
      keywordsList.length > 0
        ? `TARGET KEYWORDS — anchor naturally in headings and body where they fit; never stuff:\n${keywordsList.join(", ")}`
        : "",
    ].filter(Boolean).join("\n\n");


    // Derive project isolation key from SUPABASE_URL (unique per Supabase project/deployment).
    // Falls back to body.projectId when explicitly provided by the caller.
    const projectId: string = body.projectId || (() => {
      try { return new URL(SUPABASE_URL).hostname.split(".")[0]; } catch { return ""; }
    })();

    // 1. Load brain units scoped to this project.
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch tone profile if provided — enforces voice, sentence length, and writing style.
    let toneProfile: { summary: string | null; characteristics: Record<string, string>; example_phrases: string[] | null } | null = null;
    if (body.toneProfileId) {
      const { data: profileData } = await sb
        .from("tone_profiles")
        .select("summary, characteristics, example_phrases")
        .eq("id", body.toneProfileId)
        .maybeSingle();
      if (profileData) {
        toneProfile = profileData;
        console.log("TONE PROFILE: loaded", body.toneProfileId);
      }
    }

    // When a projectId is available, restrict brain_insights to files whose brain_chunks
    // are tagged with this project — prevents cross-client content leakage.
    let insightsQuery = sb
      .from("brain_insights")
        .select("id, title, summary, full_text, unit_type, source_file_id")
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
    const h2Questions = await generateH2Questions(body.topic, model, body.valuePromiseClaims, gapInsightsList);
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
              heading: await generateFailureModeHeading(body.topic, articleTitle, model),
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

    // fixedBudget: realistic estimate of words consumed by non-body sections
    // opening(60) + tldr(70) + quicktips(50) + nav(40) + faq(300) + finalthoughts(80) = 600
    // Using 550 to give body sections a slightly larger budget
    const fixedBudget = 550;
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
    const allRetrievedChunks: RetrievedChunk[] = [];

    for (const section of plan) {
      const mappedUnit =
        section.type === "body" ? pickUnit(section.heading, body.topic, units) : null;

      // Semantic retrieval: embed (topic + section heading) and pull top 3 chunks
      // from brain_chunks. Additive — runs alongside the keyword-matched pickUnit unit.
      let retrievedChunks: RetrievedChunk[] = [];
      let retrievedKnowledge: Array<{ content: string; sourceTitle?: string | null }> = [];
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
              brain_file_id: m.brain_file_id ?? null,
              context_document_id: m.context_document_id ?? null,
            }));
            retrievedChunks = rawChunks.filter((c) =>
              c.similarity >= SIMILARITY_FLOOR && scoreTextForTopic(c.content, body.topic, section.heading) >= 2
            );
            const topRaw = rawChunks[0]?.similarity?.toFixed(3) ?? "n/a";
            console.log(`RETRIEVAL: section="${section.heading}" got ${retrievedChunks.length}/${rawChunks.length} chunks above floor ${SIMILARITY_FLOOR} (top raw sim=${topRaw})`);
          }
        } catch (e) {
          console.warn(`RETRIEVAL: embed/query failed for "${section.heading}" (non-fatal):`, e);
        }
        const contextSnippets = await retrieveContextDocumentSnippets(sb, body.topic, section.heading);
        if (contextSnippets.length > 0) {
          console.log(`CONTEXT: section="${section.heading}" matched ${contextSnippets.length} context document snippet(s).`);
          retrievedKnowledge = contextSnippets.map((s) => ({ content: s.content, sourceTitle: s.sourceTitle }));
          const existingContextIds = new Set(retrievedChunks.map((c) => c.context_document_id).filter(Boolean));
          for (const snippet of contextSnippets) {
            if (existingContextIds.has(snippet.context_document_id)) continue;
            retrievedChunks.push({
              content: snippet.content,
              similarity: 1,
              brain_file_id: null,
              context_document_id: snippet.context_document_id,
            });
          }
        } else {
          retrievedKnowledge = retrievedChunks.map((c) => ({ content: c.content }));
        }
        allRetrievedChunks.push(...retrievedChunks);
      }

      // Build the allow-listed source URL pool for THIS section: brain-unit
      // URLs (from mapped unit + globally available), retrieved-chunk URLs,
      // then topic-trusted fallbacks. Always passed to the writer so the
      // citation is generated inline, not bolted on after.
      let allowedSourceUrls: BrainUrl[] = [];
      if (section.type === "body") {
        const unitUrls = collectBrainUrls(mappedUnit ? [mappedUnit as BrainUnit] : []);
        const chunkUrls = collectChunkUrls(retrievedChunks);
        const globalUnitUrls = filterUrlsForTopic(collectBrainUrls(units), body.topic);
        const fallback = trustedFallbackSources(body.topic);
        const seen = new Set<string>();
        for (const list of [unitUrls, chunkUrls, globalUnitUrls, fallback]) {
          for (const u of list) {
            if (seen.has(u.url)) continue;
            seen.add(u.url);
            allowedSourceUrls.push(u);
          }
        }
        allowedSourceUrls = allowedSourceUrls.slice(0, 8);
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
        retrievedKnowledge,
        allowedSourceUrls,
        contextFiles: body.contextFiles,
        toneProfile,
        valuePromiseBlock,
        gapKeywordBlock,
      });

      const sectionPlaceholderGuard = stripExpertInputPlaceholders(result.content);
      const sectionContent = sectionPlaceholderGuard.out;
      if (sectionPlaceholderGuard.removed > 0) console.warn(`PLACEHOLDER GUARD: removed ${sectionPlaceholderGuard.removed} expert-input placeholder sentence(s) from section "${section.heading}".`);

      surrounding.push({ heading: section.heading, content: sectionContent });
      sectionsOut.push({
        id: section.id,
        heading: section.heading,
        kind: section.kind,
        type: section.type,
        mappedUnitId: mappedUnit?.id ?? null,
        mappedUnitType: mappedUnit?.unit_type ?? null,
        content: sectionContent,
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
    // 2026-06-04: FAQ count enforcement helpers. The model occasionally returns
    // 3-4 Q&A pairs despite the "EXACTLY 5" instruction; this top-up appends
    // deterministic generic pairs to guarantee the article always renders 5.
    const buildFallbackFaq = (topic: string, count: number): string => {
      const t = topic.replace(/[?!.]+$/, "").trim();
      const pool: Array<[string, string]> = [
        [`**What is the key difference between the main options for ${t}?**`,
          "The primary distinction is in what each option is designed to prevent or solve. Each approach addresses a different failure mode, so confirming which failure mode applies to your situation is the first decision."],
        [`**How do I know which option is right for my situation?**`,
          "Start with the constraint that cannot be traded away — cost, timeline, location, or compatibility. Rule out options that fail on any hard constraint before comparing the remaining ones on outcome."],
        [`**What should I ask before committing to a choice for ${t}?**`,
          "Ask what measurable outcome will confirm the choice is working within a defined timeframe, and what triggers a change of plan if it is not delivering that result."],
        [`**What are the most common mistakes people make with ${t}?**`,
          "The recurring pattern is choosing on price or convenience first and validating fit afterwards. Reversing that order — fit first, price second — eliminates most regrettable decisions."],
        [`**How long does it typically take to see results from ${t}?**`,
          "Meaningful results usually appear within a defined evaluation window. Track the specific indicator that matches the chosen approach and review progress at the agreed checkpoint rather than reacting to short-term noise."],
      ];
      const pairs = pool.slice(0, Math.max(0, Math.min(count, pool.length)));
      return pairs.map(([q, a]) => `${q}\n\n${a}`).join("\n\n");
    };
    // Derive FAQ pairs from the article's own question H2s and their atomic
    // answers — far better AEO value than generic topic-templated fillers.
    const buildContentDerivedFaq = (
      sections: Array<{ heading: string; content: string }>,
      existingFaq: string,
      need: number,
    ): string[] => {
      const existing = existingFaq.toLowerCase();
      const pairs: string[] = [];
      for (const s of sections) {
        if (pairs.length >= need) break;
        const heading = (s.heading || "").trim();
        if (!heading.endsWith("?")) continue;
        if (existing.includes(heading.toLowerCase().replace(/\?$/, ""))) continue;
        // First text paragraph: skip images, tables, bullets, blockquotes
        const para = (s.content || "")
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .find((p) => p && !/^!\[/.test(p) && !/^\|/.test(p) && !/^[-*+>]/.test(p) && !/^#{1,6}\s/.test(p));
        if (!para) continue;
        // First two sentences, capped
        const sentences = para.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).join(" ").trim() || para;
        const answer = sentences.split(/\s+/).slice(0, 45).join(" ");
        if (answer.split(/\s+/).length < 8) continue;
        pairs.push(`**${heading}**\n\n${answer}${/[.!?]$/.test(answer) ? "" : "."}`);
      }
      return pairs;
    };
    const countFaqPairs = (faq: string): number => {
      const re = /^\s*\*\*[^*\n]+\?\*\*\s*$/gm;
      return (faq.match(re) || []).length;
    };
    const ensureFiveFaqPairs = (
      faq: string,
      topic: string,
      sections: Array<{ heading: string; content: string }> = [],
    ): string => {
      const have = countFaqPairs(faq);
      if (have >= 5) return faq;
      let need = 5 - have;
      const parts: string[] = [];
      // 1. Prefer pairs derived from the article's own question sections.
      const derived = buildContentDerivedFaq(sections, faq, need);
      parts.push(...derived);
      need -= derived.length;
      // 2. Only then fall back to topic-templated pool fillers.
      if (need > 0) {
        parts.push(buildFallbackFaq(topic, 5).split(/\n\n(?=\*\*)/).slice(-need).join("\n\n"));
      }
      console.warn(`STITCH: FAQ had ${have} pair(s) — appended ${derived.length} content-derived + ${need} filler pair(s) to reach 5.`);
      return (faq.trimEnd() + "\n\n" + parts.join("\n\n")).trim();
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
        // For FAQ: inject a deterministic fallback rather than silently dropping the section.
        if (s.kind === "faq") {
          const derivedPairs = buildContentDerivedFaq(sectionsOut, "", 5);
          const remaining = 5 - derivedPairs.length;
          const fallbackFaq = [
            ...derivedPairs,
            ...(remaining > 0
              ? [buildFallbackFaq(body.topic, 5).split(/\n\n(?=\*\*)/).slice(-remaining).join("\n\n")]
              : []),
          ].join("\n\n");
          console.warn(`STITCH: FAQ was empty — injected ${derivedPairs.length} content-derived + ${remaining} filler pair(s).`);
          md.push("## Frequently Asked Questions", "", fallbackFaq, "");
          continue;
        }
        console.warn(`STITCH: dropping empty section "${s.heading}" (kind=${s.kind})`);
        continue;
      }
      if (s.kind === "opening") {
        md.push(cleanContent, "");
      } else if (s.kind === "tldr") {
        md.push("## TL;DR", "", trimToWordCount(cleanContent, 60), "");
      } else if (s.kind === "quick-tips") {
        md.push("## Quick Tips", "", normaliseQuickTipsContent(cleanContent), "");
      } else if (s.kind === "faq") {
        // Enforce EXACTLY 5 Q&A pairs: top-up with deterministic fillers if model produced fewer.
        const topped = ensureFiveFaqPairs(cleanContent, body.topic, sectionsOut);
        md.push("## Frequently Asked Questions", "", topped, "");
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
    stitched = enforceOpeningLength(stitched);
    // injectHowToChoose must run BEFORE injectInThisArticle so the nav includes it
    stitched = injectHowToChoose(stitched, body.topic);
    stitched = injectInThisArticle(stitched, body.topic);
    stitched = ensureMinimumTables(stitched, body.topic, targetWords);
    stitched = ensureFinalThoughtsCta(stitched, businessType);
    stitched = enforceFinalThoughtsParagraphs(stitched);
    // Inline citations from brain-unit URLs, with trusted dental fallbacks when
    // proprietary files have no URLs.
    // Only collect citation URLs from units that were actually mapped to avoid
    // injecting cross-topic (e.g. dental) URLs into unrelated articles.
    const usedUnitIds = new Set(sectionsOut.map(s => s.mappedUnitId).filter(Boolean));
    const usedUnits = units.filter(u => usedUnitIds.has(u.id));
    // REFERENCES: context file URLs only — no brain URLs, no fallbacks.
    // Rule: use only what is in the uploaded context files, filtered for
    // authority + relevance. No hallucinated or recycled cross-topic sources.
    const sourceReferences: SourceReference[] = (body.contextFiles?.length ?? 0) > 0
      ? extractContextFileReferences(body.contextFiles!, body.topic)
      : [];
    console.log(`REFERENCES: extracted ${sourceReferences.length} context-file reference(s) for topic "${body.topic}".`);

    // Inline citations from brain URLs are suppressed — they leak cross-topic
    // URLs and get stripped by stripBodyNumericCitationMarkers anyway.
    // Keep the attach call for logging only; stripped immediately after.
    const brainUrls = filterUrlsForTopic(collectBrainUrls(usedUnits), body.topic);
    const cite = attachInlineCitations(stitched, []);
    stitched = cite.out;
    // attachContextSourceNotes call removed (BUILD-2026-05-29-G) — see helpers block.
    // Context-document references now rendered only in the footer References section.
    stitched = injectReferences(stitched, usedUnits, sourceReferences);
    stitched = ensureTrustedReferences(stitched, body.topic, sourceReferences);
    const sourceFragments = stripInlineSourceFragments(stitched);
    stitched = sourceFragments.out;
    if (sourceFragments.removed > 0) console.warn(`SOURCE GUARD: stripped ${sourceFragments.removed} inline Source fragment(s) from body copy.`);
    const numericMarkers = stripBodyNumericCitationMarkers(stitched);
    stitched = numericMarkers.out;
    if (numericMarkers.removed > 0) console.warn(`CITATION GUARD: removed ${numericMarkers.removed} orphan numeric citation marker(s) from body.`);

    const sourceLinkGuard = stripMismatchedInlineLinks(stitched, body.topic);
    stitched = sourceLinkGuard.out;
    if (sourceLinkGuard.removed > 0) console.warn(`SOURCE GUARD: removed ${sourceLinkGuard.removed} off-topic inline link(s).`);
    const refsEmitted = /^##\s+references/im.test(stitched);
    if (!refsEmitted) console.warn(`REFERENCES: no References section emitted — no source files, source URLs, or trusted fallbacks found.`);
    stitched = stripBrandPlaceholders(stitched);
    const bracketPlaceholders = stripAllBracketPlaceholders(stitched);
    stitched = bracketPlaceholders.out;
    if (bracketPlaceholders.removed > 0) console.warn(`PLACEHOLDER GUARD: removed ${bracketPlaceholders.removed} bracket brand/client placeholder sentence(s).`);
    const expertPlaceholders = stripExpertInputPlaceholders(stitched);
    stitched = expertPlaceholders.out;
    if (expertPlaceholders.removed > 0) console.warn(`PLACEHOLDER GUARD: removed ${expertPlaceholders.removed} expert-input placeholder sentence(s).`);
    // TABLE UNWRAP (BUILD-2026-05-29-G): strip list markers / leading indent
    // from pipe-table runs and guarantee \n\n fences so the client renders them
    // as top-level <table> siblings, never nested inside <li>.
    const tableUnwrap = unwrapTablesFromLists(stitched);
    stitched = tableUnwrap.out;
    if (tableUnwrap.unwrapped > 0) console.log(`TABLES: unwrapped ${tableUnwrap.unwrapped} pipe-table block(s) from list/indent context.`);
    let content = sanitiseGeneratedMarkdown(stitched, articleTitle);
    const internalLinkResult = await insertInternalLinksIntoArticle(content, body.internalLinks, body.topic);
    content = internalLinkResult.content;
    const internalLinkGuard = stripMismatchedInlineLinks(content, body.topic);
    content = internalLinkGuard.out;
    if (internalLinkGuard.removed > 0) console.warn(`SOURCE GUARD: removed ${internalLinkGuard.removed} off-topic link(s) after internal-link insertion.`);

    // LINK ZONE GUARD (deterministic): the opening paragraph (#direct-answer) and the
    // TL;DR section must contain no links — they are the AI-retrieval zones. Unlink
    // any markdown links that landed there, keeping the anchor text.
    {
      const linkRe = /\[([^\]]+)\]\([^)]+\)/g;
      const parts = content.split(/\n(?=## )/);
      let unlinkedZones = 0;
      for (let i = 0; i < parts.length; i++) {
        const isOpening = i === 0; // H1 + opening paragraph before the first H2
        const isTldr = /^##\s*TL;DR/i.test(parts[i]);
        if (isOpening || isTldr) {
          const before = parts[i];
          parts[i] = parts[i].replace(linkRe, "$1");
          if (parts[i] !== before) unlinkedZones++;
        }
      }
      if (unlinkedZones > 0) {
        content = parts.join("\n");
        console.warn(`LINK ZONE GUARD: unlinked markdown link(s) in ${unlinkedZones} protected zone(s) (opening/TL;DR).`);
      }
    }
    // LINK REPAIR GUARD (deterministic safety net): rejoin markdown links and
    // URLs that any earlier pass split. Fixes "]  (https://" gaps and domains
    // broken across whitespace/newlines ("bigleagueshirts. com/pages/x").
    {
      const beforeLinkRepair = content;
      content = content
        .replace(/\]\s+\((https?:\/\/)/g, "]($1")
        .replace(/(https?:\/\/[a-z0-9.-]*[a-z0-9-])\.\s+((?:com|net|org|gov|edu|co|io|uk)\b[^\s)]*)/gi, "$1.$2");
      if (content !== beforeLinkRepair) console.warn("LINK REPAIR: rejoined split markdown link(s)/URL(s).");
    }

    const finalNumericMarkers = stripBodyNumericCitationMarkers(content);
    content = finalNumericMarkers.out;
    if (finalNumericMarkers.removed > 0) console.warn(`CITATION GUARD: removed ${finalNumericMarkers.removed} orphan numeric citation marker(s) after final formatting.`);
    // Entity Bridge — inject brand paragraph at natural team/league/equipment transition
    if (body.entityBridgeConfig?.brandName && body.entityBridgeConfig?.collectionUrl) {
      content = injectEntityBridge(content, body.topic, {
        brandName: body.entityBridgeConfig.brandName,
        collectionUrl: body.entityBridgeConfig.collectionUrl,
        productLabel: body.entityBridgeConfig.productLabel || `custom ${body.entityBridgeConfig.sportLabel || ""} jerseys`.trim(),
        sportLabel: body.entityBridgeConfig.sportLabel || body.topic.split(" ")[0].toLowerCase(),
      });
    }

    const crossDomainFallbacks = stripCrossDomainFallbackBullets(content, body.topic);
    content = crossDomainFallbacks.out;
    if (crossDomainFallbacks.removed > 0) console.warn(`DOMAIN GUARD: removed ${crossDomainFallbacks.removed} cross-domain fallback bullet(s) after final formatting.`);

    // YEAR-ANCHOR GUARD: ongoing facts must not be tied to past seasons/years.
    // Deterministic strip — same patterns as the FAQ bulk generator. Historical
    // milestones phrased as events ("recognised flag football in 2020") are untouched;
    // only "as of / since / for the <year> season" anchors on current-state facts are removed.
    const beforeYearStrip = content;
    content = content
      .replace(/\b(?:as of|for|in|during) the \d{4}[-\u2013]\d{2,4} (?:season|academic year|school year|competitive season)\b/gi, "currently")
      .replace(/\bas of the \d{4} season\b/gi, "currently")
      .replace(/\bas of \d{4}[-\u2013]?\d{0,4}\b/gi, "currently")
      .replace(/\(as of \d{4}[-\u2013]?\d{0,4}\)/gi, "")
      .replace(/\bsince \d{4}\b/gi, "")
      .replace(/ {2,}/g, " ")
      .replace(/ ([.,;])/g, "$1");
    if (content !== beforeYearStrip) console.warn("YEAR GUARD: stripped past-year anchor(s) from ongoing facts.");
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
          gapAnalysisUsed: !!(body.gapAnalysis?.trim()) || gapInsightsList.length > 0,
          formatReferenceUsed: false,
          contextFilesUsed: units.length > 0 || (body.contextFiles?.length ?? 0) > 0,
          contextFileNames: (body.contextFiles || []).map((f: { name: string }) => f.name),
          keywordsUsed: keywordsList.length > 0,
          keywords: keywordsList,
          targetWordCount: targetWords,
          outlineProvided: true,
          customInstructionsProvided: false,
          knowledgeBaseUsed: units.length > 0,
          toneProfileUsed: !!toneProfile,
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
