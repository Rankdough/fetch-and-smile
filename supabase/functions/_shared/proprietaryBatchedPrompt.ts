// Proprietary mode - BATCHED prompt builder + parser.
//
// Phase 1 of the v2 architecture rebuild. Instead of one model call per body
// or framing section (re-sending tone, rules, context files, value promises
// each time), this module bundles sections into strict delimiter contracts.
// The parser splits the response back into per-section content. Sections that
// fail to parse fall back to the legacy per-section path.
//
// Pure module: no I/O, no Deno-specific APIs. Safe to import from the edge
// function or unit-test in Node/Deno.

import type {
  AllowedSourceUrl,
  BusinessType,
  MappedUnit,
  SectionKind,
} from "./proprietaryPromptAssembler.ts";

export interface BatchedSectionBrief {
  id: string;
  heading: string;
  kind: SectionKind;
  budgetWords: number;
  mappedUnit: MappedUnit | null;
  retrievedKnowledge?: Array<{ content: string; sourceTitle?: string | null }>;
  allowedSourceUrls?: AllowedSourceUrl[];
}

export interface BatchedBodyInput {
  businessType: BusinessType;
  articleTitle: string;
  audienceSentence: string;
  publicationDestination: "ai-search" | "human-blog" | "both";
  toneProfile?:
    | { summary: string | null; characteristics: Record<string, string>; example_phrases: string[] | null }
    | null;
  valuePromiseBlock?: string;
  gapKeywordBlock?: string;
  contextFiles?: Array<{ name: string; content: string }>;
  sectionBudgetWords: number;
  briefs: BatchedSectionBrief[];
}

export interface BatchedFramingBrief {
  id: string;
  heading: string;
  kind: SectionKind;
}

export interface BatchedFramingInput {
  businessType: BusinessType;
  articleTitle: string;
  topic: string;
  audienceSentence: string;
  publicationDestination: "ai-search" | "human-blog" | "both";
  toneProfile?:
    | { summary: string | null; characteristics: Record<string, string>; example_phrases: string[] | null }
    | null;
  valuePromiseBlock?: string;
  gapKeywordBlock?: string;
  contextFiles?: Array<{ name: string; content: string }>;
  bodySections: Array<{ id: string; heading: string; content: string }>;
  briefs: BatchedFramingBrief[];
}

export interface BuiltBatchedPrompt {
  system: string;
  user: string;
}

// Delimiter contract - kept simple and unambiguous so a regex parser can split
// even if the model wraps content in code fences or adds stray text between
// sections.
const SECTION_OPEN_RE = /<<<SECTION\s+id\s*=\s*"([^"]+)"[^>]*>>>/g;
const SECTION_CLOSE = "<<<END SECTION>>>";

function describeUnit(unit: MappedUnit | null): string {
  if (!unit) return "MAPPED UNIT: none. Generate from first-hand reasoning following the global rules.";
  const header = `MAPPED UNIT (type: ${unit.unit_type}${unit.title ? `, title: ${unit.title}` : ""}):`;
  const summary = unit.summary ? `Summary: ${unit.summary}` : "";
  const body = `Full unit text (sole source for specifics in this section):\n"""\n${unit.full_text.slice(0, 1500)}${unit.full_text.length > 1500 ? "..." : ""}\n"""`;
  return [header, summary, body].filter(Boolean).join("\n");
}

function describeKnowledge(snippets: BatchedSectionBrief["retrievedKnowledge"]): string {
  if (!snippets || snippets.length === 0) return "RETRIEVED EVIDENCE: none.";
  const block = snippets
    .slice(0, 3)
    .map((s, i) =>
      `[${i + 1}]${s.sourceTitle ? ` ${s.sourceTitle}` : ""}\n${s.content.slice(0, 900)}${s.content.length > 900 ? "..." : ""}`,
    )
    .join("\n\n");
  return `RETRIEVED EVIDENCE - prefer over general knowledge:\n${block}`;
}

function describeAllowedUrls(urls: BatchedSectionBrief["allowedSourceUrls"]): string {
  const allowed = (urls || []).filter((u) => u && u.url && /^https?:\/\//i.test(u.url)).slice(0, 3);
  if (allowed.length === 0) {
    return "ALLOWED INLINE SOURCE URLS: none. Do NOT insert any inline markdown link in this section.";
  }
  return `ALLOWED INLINE SOURCE URLS (insert EXACTLY ONE inline markdown link "[anchor](URL)" using one of these, anchor is a natural 3-7 word noun phrase from your prose):\n${
    allowed.map((u, i) => `${i + 1}. ${u.title} - ${u.url}`).join("\n")
  }`;
}

function buildToneBlock(
  toneProfile: BatchedBodyInput["toneProfile"],
): string | null {
  if (!toneProfile) return null;
  const chars = Object.entries(toneProfile.characteristics || {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const phrases = toneProfile.example_phrases?.length
    ? `\nExample phrases that match this voice (write like this):\n${
      toneProfile.example_phrases.map((p, i) => `${i + 1}. "${p}"`).join("\n")
    }`
    : "";
  return `TONE OF VOICE - HIGHEST PRIORITY RULE:
Your writing MUST match this tone profile. Short sentences. Plain language. Every sentence in this voice.

Voice summary: ${toneProfile.summary || "Not specified"}
${chars ? `\nVoice characteristics:\n${chars}` : ""}${phrases}

CRITICAL: If the tone is conversational, use short sentences under 20 words. Never start with "While", "Although", "Given that", or "It is important to note".`;
}

// The block of global rules that applies identically to every body section.
// Mirrors the always-on rules from proprietaryPromptAssembler.assembleSectionPrompt
// (NO_COMMODITY, HONEST_ANSWER, SPECIFIC_NUMBERS, NO_PASSIVE_FILLER,
// KEYWORD_NATURAL, TABLE_GUARD, QUOTE_ATTRIBUTION, SOURCED_FIGURES,
// AI_EXTRACTION_RULES 9-16, atomic structure scaled to budget).
//
// Per-section-dependent rules (RULE 3 with/without unit, RULE 4 failure mode
// with/without unit, RULE 6 contrarian) are emitted inside each section brief
// in the user message.
function buildGlobalRulesBlock(sectionBudgetWords: number): string {
  const isLarge = sectionBudgetWords >= 300;
  const isVeryLarge = sectionBudgetWords >= 500;
  const h3Count = isVeryLarge ? 3 : isLarge ? 2 : 0;
  const minWords = Math.round(sectionBudgetWords * 0.85);

  const atomic = h3Count === 0
    ? `ATOMIC SECTION STRUCTURE (every body section):
MINIMUM ${minWords} words. Target: ${sectionBudgetWords} words.
  1. ONE standalone answer paragraph (2-3 sentences; 80-150 words) that fully answers the section heading on its own.
  2. A blank line.
  3. EXACTLY 3 markdown bullets ("- "), each 14-25 words, each a single concrete specific actionable point.
Do NOT add a sub-heading inside the section. Do NOT add a second paragraph after the bullets.`
    : `ATOMIC SECTION STRUCTURE (every body section):
MINIMUM ${minWords} words. Target: ${sectionBudgetWords} words.
Base layer (always):
  1. ONE standalone answer paragraph (2-3 sentences; 80-150 words) that fully answers the heading.
  2. Blank line.
  3. EXACTLY 3 markdown bullets ("- "), each 14-25 words.
Expansion layer (required to hit the budget):
  4. Add ${h3Count} H3 sub-sections (### Heading), each: 80-150 word answer paragraph + blank line + exactly 3 bullets (14-25 words each).
  5. Add ONE markdown table with at least 4 data rows somewhere in the section (after base bullets or inside an H3). At least one column numeric.
Do NOT cross-reference other sections. Every sentence stands alone.`;

  return [
    `RULE 1 - NO COMMODITY: Every paragraph must contain at least one specific number, named failure mode, concrete category distinction, or claim that contradicts the consensus framing. [NEEDS EXPERT INPUT] is INLINE only, never the whole section.`,
    `RULE 2 - LEAD WITH THE HONEST ANSWER: First sentence is a direct claim or direct answer. No preamble. If the heading is a question, sentence 1 answers it plainly.`,
    `RULE 5 - SPECIFIC NUMBERS: Do not write "varies", "depends on", "typically", or "usually" without a specific number in the same sentence. If no number is available, write "No public data; ask the clinical team for current figures." or use [NEEDS EXPERT INPUT] inline. Never invent numbers. HARD: Do NOT use "typically", "varies", "depends", "generally", "often", "usually", "may vary", "in some cases" unless the same sentence contains a specific number.`,
    `CRITICAL - NO PASSIVE FILLER: Banned: "typically symptoms of", "may experience", "can experience", "is often caused by", "a variety of", "a range of", "a number of", "in some cases", "for many people", "it is important to note", "it is worth noting". Every statement must be direct and anchored to supplied evidence.`,
    `KEYWORD NATURAL-LANGUAGE: Treat the article title as a topic, not a phrase to stuff. The exact title may appear in H1 and at most one H2 - NEVER in body paragraphs, bullets, table cells, or FAQ answers verbatim.`,
    `RULE 7 - MANDATORY TABLE (≥4 rows): Every body section contains exactly one Markdown pipe table with at least 4 data rows. Real decision dimensions only. At least one column numeric. NEVER use placeholder rows like "Option A/B/C" or "Type 1/2/3". HARD MINIMUM: Split rows to reach 4 if needed.`,
    `QUOTE ATTRIBUTION: No quotation marks around any sentence presented as something a clinician/expert said unless (a) the exact quote is supplied verbatim in the mapped unit or context files, AND (b) the named speaker (full name + role + affiliation) is also supplied. Inline attribution: "<Quote>" - <Name>, <Role>, <Affiliation>. No blockquotes. No "an expert noted", "a doctor said", generic proverbs, or training-data quotes.`,
    `SOURCED FIGURES: Any specific currency amount, percentage tied to a clinical claim, or specific volume/count MUST either (a) appear in the mapped unit or context files AND be cited inline as "(Source: <URL or publication>)" in the same sentence, OR (b) be replaced by "No public data; ask the clinical team for current figures." or [NEEDS EXPERT INPUT]. A removed number is always better than a fabricated one.`,
    `AI EXTRACTION RULES 9-16 (every section):
RULE 9 ANSWER PROXIMITY: direct answer to the article's primary question appears in the first 80 words of the article body.
RULE 10 SELF-CONTAINED SENTENCES: every sentence makes complete sense extracted in isolation. Avoid "This is why...", "That makes it...", "These are the..." openers. Avoid "high quality", "world-class", "affordable", "premium", "cutting-edge", "best-in-class" without a specific supporting fact.
RULE 11 METHODOLOGY: include ONE explicit sentence in the article in format "This data was compiled from [specific source]." after the first data-containing section. One per article only.
RULE 12 INFORMATION GAIN: every body section contains at least one data point not available on competing pages, else output the inline placeholder [NEEDS EXPERT INPUT: ...].
RULE 13 BUYER JOURNEY: write for ONE stage (Discovery, Validation, or Execution). Do not mix.
RULE 14 OFF-SITE QUOTABILITY: every key claim is a standalone quotable statement. The brand name appears naturally in context at least twice per article.
RULE 15 GHOST CITATION: brand or business name appears in the first paragraph, in at least one body H2/H3, and in Final Thoughts. As SUBJECT of a sentence, not just possessive.
RULE 16 MULTI-ENGINE DENSITY: at least four independently citable facts per article, each with a specific number or named source.`,
    `RULE 17 - PARAGRAPH LENGTH: No prose paragraph exceeds 3 sentences. Convert extra explanation into a bulleted list immediately below.`,
    atomic,
    `OUTPUT FORMAT for every section: Markdown only. No front-matter, no code fences. Do NOT repeat the H2 heading inside the section body.`,
    `HARD REQUIREMENT - NUMERIC DENSITY: ≥3 specific numbers, percentages, or counts with units per section. Vague claims without numbers fail.`,
    `NEVER use em dashes, en dashes, or horizontal rules. NEVER output bracket placeholders such as [Client Name], [Practice Name], [Your Business Name].`,
  ].join("\n\n");
}

function briefSectionRules(brief: BatchedSectionBrief): string {
  const lines: string[] = [];
  if (brief.kind === "h2-question") {
    const hasTradeoffUnit = brief.mappedUnit &&
      (brief.mappedUnit.unit_type === "tradeoff" || brief.mappedUnit.unit_type === "contrarian");
    if (hasTradeoffUnit) {
      lines.push(
        `RULE 3 - DISTINGUISH CATEGORIES: Your mapped unit carries a distinction. Surface it explicitly before any recommendation. Name the categories, describe what separates them, then state which the recommendation applies to.`,
      );
    } else {
      lines.push(
        `RULE 3 - DISTINGUISH CATEGORIES IF APPLICABLE: If a category distinction applies (mild vs severe, marketing label vs technical category, etc.), draw it explicitly before any recommendation.`,
      );
    }
    if (!brief.mappedUnit || brief.mappedUnit.unit_type !== "contrarian") {
      lines.push(
        `RULE 6 - CONTRADICT CONSENSUS WHEN WARRANTED: If the topic is built on a marketing term or claim experienced clinicians push back on, say so early in plain language. Do NOT manufacture a contradiction where the consensus is genuinely correct.`,
      );
    }
  }
  if (brief.kind === "failure-mode") {
    const hasFailureUnit = brief.mappedUnit && brief.mappedUnit.unit_type === "failure";
    if (hasFailureUnit) {
      lines.push(
        `RULE 4 - FAILURE MODE WITH UNIT: Describe the actual failure from the mapped unit. Use the unit's specifics verbatim: what went wrong, why, what would have prevented it.`,
      );
    } else {
      lines.push(
        `RULE 4 - FAILURE MODES (no unit mapped): Describe 3-4 specific well-documented failure patterns. For each: (a) the named mechanism, (b) the specific clinical consequence, (c) the contributing factor, (d) the mitigation. Bold the failure name at the start of each bullet. No vague "complications can occur".`,
      );
    }
  }
  return lines.join("\n\n");
}

export function buildBatchedBodyPrompt(input: BatchedBodyInput): BuiltBatchedPrompt {
  const baseIdentity = `You are a proprietary-content writer for a ${input.businessType} business.
You write multiple sections in ONE response, each grounded in its own mapped knowledge unit and retrieved evidence.
You never invent specific numbers, case counts, named patients, or fabricated citations.
You never use em dashes, en dashes, or horizontal rules.
You never output bracket placeholders such as [Client Name], [Practice Name], [Your Business Name], or unwrapped [NEEDS EXPERT INPUT] as the whole section body.`;

  const toneBlock = buildToneBlock(input.toneProfile);

  const systemParts: string[] = [
    baseIdentity,
    toneBlock,
    `AUDIENCE: ${input.audienceSentence}`,
    `PUBLICATION DESTINATION: ${input.publicationDestination} - ${
      input.publicationDestination === "ai-search"
        ? "optimise for AI citation: dense factual claims, short paragraphs, named sources."
        : input.publicationDestination === "human-blog"
        ? "optimise for human reading: clear flow, illustrative examples, scannable structure."
        : "balance both: dense facts in topic sentences, illustrative detail in supporting sentences."
    }`,
    `ARTICLE TITLE: ${input.articleTitle}`,
    buildGlobalRulesBlock(input.sectionBudgetWords),
  ].filter((x): x is string => !!x);

  const system = systemParts.join("\n\n");

  // ── user message ───────────────────────────────────────────────────────
  const userParts: string[] = [];

  if (input.contextFiles && input.contextFiles.length > 0) {
    const ctxBlock = input.contextFiles.map((f) => `--- ${f.name} ---\n${f.content}`).join("\n\n");
    userParts.push(
      "🚨 PRIMARY SOURCE OF TRUTH - UPLOADED CONTEXT FILES (HIGHEST PRIORITY).\n" +
        "These files override every other knowledge source for every section below. Pull raw, unvarnished data points directly from them: exact numbers, named timelines, dosages, eligibility criteria, contraindications, study names, percentages, and specific medical/clinical criteria. Quote the files verbatim where a phrase is diagnostic. Do not paraphrase a fact into a softer summary. Do not invent figures absent from these files. If a required fact is missing for a section, write [NEEDS EXPERT INPUT] inline.\n\n" +
        ctxBlock,
    );
  }

  if (input.valuePromiseBlock) {
    userParts.push(
      `HARD REQUIREMENT - VALUE PROMISES (every section must directly address at least one):\n${
        input.valuePromiseBlock.replace(/^VALUE PROMISES\s+[\u2013\u2014-]\s+the reader expects ALL of these specific outcomes\. Every section must directly address at least one:\n/, "")
      }`,
    );
  }

  if (input.gapKeywordBlock) {
    userParts.push(
      `KEYWORD & GAP INTEGRATION — MANDATORY CHECKLIST:\nEach of the following target keywords and competitor gaps MUST appear naturally at least once across your sections. Treat this as a required checklist, not optional guidance. Do not force awkward placement, but do not omit any item:\n${input.gapKeywordBlock}`,
    );
  }

  // Per-section briefs
  userParts.push(
    `=== BATCHED SECTION GENERATION CONTRACT ===
You will now write ${input.briefs.length} body sections in ONE response.
For EACH section, output EXACTLY this format with no extra commentary, no code fences, no markdown around the delimiters:

<<<SECTION id="<section-id>" heading="<section-heading>" budget_words=${input.sectionBudgetWords}>>>
<full markdown body of the section, following ALL global rules above AND the section-specific brief below>
<<<END SECTION>>>

Rules for the batched output:
1. Emit sections in the order listed below.
2. Use the exact id and heading from each brief (do not invent IDs).
3. Emit all sections; write nothing outside the delimiters.
4. Sections are independent — no cross-references, no repeated heading inside the body.`,
  );

  const briefBlocks = input.briefs.map((brief) => {
    const sectionRules = briefSectionRules(brief);
    return [
      `ID: ${brief.id}`,
      `HEADING: ${brief.heading}`,
      `KIND: ${brief.kind}`,
      `BUDGET WORDS: ${brief.budgetWords}`,
      sectionRules || null,
      describeUnit(brief.mappedUnit),
      describeKnowledge(brief.retrievedKnowledge),
      describeAllowedUrls(brief.allowedSourceUrls),
    ].filter(Boolean).join("\n\n");
  });

  userParts.push(briefBlocks.join("\n\n"));

  userParts.push(
    `=== BEGIN OUTPUT ===\nEmit all ${input.briefs.length} sections now using the delimiter contract. Start with <<<SECTION id="${
      input.briefs[0]?.id ?? ""
    }" ...>>> on the very first line. Do not write anything before it.`,
  );

  return { system, user: userParts.join("\n\n") };
}

function framingRulesForKind(kind: SectionKind): string {
  if (kind === "opening") {
    return `OPENING RULE: Write 55-85 words in one or two short paragraphs. The first sentence must directly answer the article topic. Reframe weak marketing or commodity assumptions immediately. No links.

NUMERICAL ANCHORS (mandatory): The opening paragraph MUST contain at least TWO numerical elements that directly support the answer to the main question. A numerical element is a digit-form number, percentage, monetary amount, year/date, or duration (e.g. "4 questions", "40%", "£2,500", "2026", "6 months", "10 years"). Spelled-out words ("two", "several", "many") do NOT count. Prefer numbers already present in the context files, the article title, or the body sections; never fabricate clinical statistics or invented prices. If only one real number is available, derive the second from the title (e.g. the count of items the title promises) or from a clearly safe range based on the supplied evidence.`;
  }
  if (kind === "tldr") {
    return `TL;DR RULE: Write one paragraph only, maximum 60 words. No bullets, no sub-headings, no links. Summarise the single most important takeaway in plain language.

NUMERICAL ANCHORS (mandatory): The TL;DR MUST contain at least TWO numerical elements that directly support the answer to the main question. A numerical element is a digit-form number, percentage, monetary amount, year/date, or duration (e.g. "4 questions", "40%", "£2,500", "2026", "6 months"). Spelled-out words ("two", "several", "many") do NOT count. Use numbers already present in the context files, the article title, or the body sections above; never fabricate clinical statistics or invented prices.`;
  }
  if (kind === "quick-tips") {
    return `QUICK TIPS RULE: Output EXACTLY 3 markdown bullets. Each bullet is one actionable sentence, maximum 18 words, naming a specific check, criterion, or decision.`;
  }
  if (kind === "faq") {
    return `FAQ RULE: Output EXACTLY 5 question-and-answer pairs. Each question line must be bold markdown and end with a question mark. Each answer is 25-40 words — HARD LIMIT. Count the words in each answer before finishing. An answer over 40 words fails. Direct, specific, not generic boilerplate.`;
  }
  if (kind === "final-thoughts") {
    return `FINAL THOUGHTS RULE: Write exactly 2 short paragraphs. No heading. Paragraph 1 states the decision principle. Paragraph 2 gives the next action. Keep each paragraph below 65 words.`;
  }
  return `FRAMING RULE: Write concise markdown for this structural section only. No front matter, no code fences, no repeated heading.`;
}

export function buildBatchedFramingPrompt(input: BatchedFramingInput): BuiltBatchedPrompt {
  const toneBlock = buildToneBlock(input.toneProfile);
  const system = [
    `You are a proprietary-content editor for a ${input.businessType} business.
You write multiple framing sections in ONE response. You preserve the article's structure, voice, and non-commodity specificity.
You never invent specific numbers, case counts, named patients, or fabricated citations.
You never use em dashes, en dashes, horizontal rules, code fences, or bracket placeholders.`,
    toneBlock,
    `AUDIENCE: ${input.audienceSentence}`,
    `PUBLICATION DESTINATION: ${input.publicationDestination} - ${
      input.publicationDestination === "ai-search"
        ? "optimise for AI citation: dense factual claims, short paragraphs, named sources."
        : input.publicationDestination === "human-blog"
        ? "optimise for human reading: clear flow, illustrative examples, scannable structure."
        : "balance both: dense facts in topic sentences, illustrative detail in supporting sentences."
    }`,
    `ARTICLE TITLE: ${input.articleTitle}`,
    `FRAMING GLOBAL RULES:
- British English.
- No passive filler: never write "typically", "varies", "depends", "generally", "often", "usually", "may vary", "in some cases", or "it is important to note" unless the same sentence contains a specific number.
- Treat the title as a topic, not a phrase to stuff. Do not repeat the exact long query in body copy.
- No fabricated quotes. No source claims unless supplied in the context below.
- Paragraphs are 3 sentences maximum and 60 words maximum.
- Markdown only inside each delimiter. Do not repeat section headings inside section bodies.`,
  ].filter((x): x is string => !!x).join("\n\n");

  const userParts: string[] = [];
  // Context files are NOT sent to Call 2 — they were already used in Call 1 (body batch).
  // Framing sections derive facts from the body sections written in Call 1.
  if (input.valuePromiseBlock) {
    userParts.push(`VALUE PROMISES - all framing sections should reinforce these outcomes without padding:\n${input.valuePromiseBlock.replace(/^VALUE PROMISES\s+[\u2013\u2014-]\s+the reader expects ALL of these specific outcomes\. Every section must directly address at least one:\n/, "")}`);
  }
  if (input.gapKeywordBlock) {
    userParts.push(`SECONDARY GUIDANCE - competitor gaps and target keywords. Use only where natural:\n${input.gapKeywordBlock}`);
  }
  if (input.bodySections.length > 0) {
    userParts.push(`BODY SECTIONS ALREADY WRITTEN - derive Quick Tips, FAQ answers, and Final Thoughts from these exact section answers:\n${input.bodySections.map((s, i) => `[BODY ${i + 1}: ${s.heading}]\n${s.content.slice(0, 600)}`).join("\n\n")}`);
  }
  userParts.push(
    `=== BATCHED FRAMING GENERATION CONTRACT ===
You will write ${input.briefs.length} framing sections in ONE response.
For EACH section, output EXACTLY this format with no extra commentary:

<<<SECTION id="<section-id>" heading="<section-heading>">>>
<full markdown body of the section, following its section-specific rule>
<<<END SECTION>>>

Rules:
1. Emit sections in the order listed below.
2. Use the exact id from each brief.
3. Do not skip any section.
4. Do not write anything outside delimiters.`,
  );
  userParts.push(input.briefs.map((brief) => [
    `ID: ${brief.id}`,
    `HEADING: ${brief.heading}`,
    `KIND: ${brief.kind}`,
    framingRulesForKind(brief.kind),
  ].join("\n")).join("\n\n"));
  userParts.push(`=== BEGIN OUTPUT ===\nEmit all ${input.briefs.length} framing sections now. Start with <<<SECTION id="${input.briefs[0]?.id ?? ""}" ...>>> on the first line.`);

  return { system, user: userParts.join("\n\n") };
}

export interface ParsedBatchedResponse {
  /** Parsed section bodies keyed by section id. Bodies are trimmed but otherwise untouched. */
  sections: Map<string, string>;
  /** Section ids that were expected but not found in the response. */
  missing: string[];
}

/**
 * Parse a batched response into per-section bodies. Tolerates the model wrapping
 * the response in code fences, adding stray text between sections, or omitting
 * the closing delimiter on the final section (we fall back to end-of-string).
 *
 * Any expected id not found is returned in `missing` so the caller can run the
 * legacy per-section fallback for just those ids.
 */
export function parseBatchedSections(raw: string, expectedIds: string[]): ParsedBatchedResponse {
  const sections = new Map<string, string>();
  if (!raw || typeof raw !== "string") {
    return { sections, missing: [...expectedIds] };
  }

  // Strip any wrapping code fence the model might add.
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*\n/, "").replace(/\n```\s*$/, "");
  }

  // Find every opening delimiter and capture id.
  const opens: Array<{ id: string; start: number; openLen: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(SECTION_OPEN_RE.source, "g");
  while ((m = re.exec(cleaned)) !== null) {
    opens.push({ id: m[1], start: m.index, openLen: m[0].length });
  }

  for (let i = 0; i < opens.length; i++) {
    const { id, start, openLen } = opens[i];
    const bodyStart = start + openLen;
    // Closing delimiter for this section is either the explicit close,
    // or the next opening delimiter, or end-of-string.
    const nextOpenStart = i + 1 < opens.length ? opens[i + 1].start : cleaned.length;
    const closeIdx = cleaned.indexOf(SECTION_CLOSE, bodyStart);
    const bodyEnd = (closeIdx !== -1 && closeIdx < nextOpenStart) ? closeIdx : nextOpenStart;
    const body = cleaned.slice(bodyStart, bodyEnd).trim();
    // Last write wins - if the model duplicates an id, keep the longer.
    const prev = sections.get(id);
    if (!prev || body.length > prev.length) {
      sections.set(id, body);
    }
  }

  const missing = expectedIds.filter((id) => {
    const v = sections.get(id);
    return !v || v.length === 0;
  });

  return { sections, missing };
}
