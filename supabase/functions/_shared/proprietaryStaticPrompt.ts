// Static prompt block for batched generation (Phase 1 — V2P1).
//
// Extracts the article-level invariants of assembleSectionPrompt so they can
// be sent ONCE per batch call rather than once per section.
//
// BYTE-IDENTITY CONTRACT:
//   buildStaticPromptBlock must produce a systemHeader that is a byte-identical
//   prefix of assembleSectionPrompt's system output for the same article-level
//   inputs. Call assertStaticBlockByteParity to verify at runtime.
//
// SYNC RULE: Every string constant below that appears in proprietaryPromptAssembler.ts
//   must be kept in sync with that file by hand — no automated check exists.
//   The byte-parity assertion in index.ts catches drift at runtime.

import type { BusinessType, AllowedSourceUrl, MappedUnit } from "./proprietaryPromptAssembler.ts";

export type { BusinessType };

// ─── Rule text constants (copied verbatim from proprietaryPromptAssembler.ts) ─

export const BATCH_NO_COMMODITY_RULE = `
RULE 1 — NO COMMODITY ANSWERS:
Do not write anything that could appear on any generic website covering this topic.
That means: no rephrased marketing copy, no "X offers an alternative to Y by …"
definitions, no balanced "pros and cons" summaries, no "consult your professional"
non-answers. Every paragraph must contain at least one of: a specific number, a
named failure mode, a concrete category distinction, or a claim that contradicts
the consensus framing.
[NEEDS EXPERT INPUT] is an INLINE placeholder, not a section escape hatch. Use it
in place of a single missing specific (e.g. "average healing time is [NEEDS EXPERT
INPUT] months") — never as the entire section body unless Rule 4 explicitly says so.
If you cannot write a non-commodity paragraph WITHOUT a specific number, write the
paragraph anyway using direct claims, failure patterns, and contrarian framing, and
mark the missing number inline.`.trim();

export const BATCH_HONEST_ANSWER_RULE = `
RULE 2 — LEAD WITH THE HONEST ANSWER:
The first sentence of this section MUST be a direct claim or direct answer.
No preamble. No context-setting. No "it depends" opener. No "In today's world".
No "When it comes to". State the answer, then defend it. If the section heading
is a question, the first sentence answers it in plain language — even if the
honest answer is "this term is mostly marketing, not a clean technical category."`.trim();

export const BATCH_CATEGORY_DISTINCTION_RULE_WITH_UNIT = `
RULE 3 — DISTINGUISH CATEGORIES BEFORE RECOMMENDING:
Your mapped knowledge unit contains a category distinction or trade-off. Surface
it explicitly before any recommendation. Name the categories, describe what
separates them, then state which category the recommendation applies to. Do not
collapse the distinction for readability.`.trim();

export const BATCH_CATEGORY_DISTINCTION_RULE_GENERIC = `
RULE 3 — DISTINGUISH CATEGORIES BEFORE RECOMMENDING:
If a category distinction applies to this topic (e.g. mild vs severe, dental vs
skeletal, adult vs paediatric, marketing label vs technical category), draw it
explicitly before any recommendation. If the topic uses a marketing umbrella
term that bundles distinct technical approaches, name the underlying categories
and refuse to treat the umbrella as a clean clinical category.`.trim();

export const BATCH_FAILURE_MODE_RULE_WITH_UNIT = `
RULE 4 — FAILURE MODES MANDATORY:
This is a failure-mode section and a "failure" unit is mapped. Describe the
actual failure from the unit: what went wrong, why it went wrong, what the
clinical team would do differently. Use the unit's specifics verbatim.`.trim();

export const BATCH_FAILURE_MODE_RULE_NO_UNIT = `
RULE 4 — FAILURE MODES MANDATORY (no unit mapped):
Describe 3-4 specific, well-documented failure patterns for this topic. For each
failure, you MUST write:
  (a) the named mechanism (what physically/biologically goes wrong),
  (b) the specific clinical consequence (what the patient or clinician sees),
  (c) the contributing factor (why it happened),
  (d) the mitigation or correct decision (what would have prevented it).
Bold the failure name at the start of each bullet. Concrete benchmark example
(dental implants): "Cement excess causing bone loss: Subgingival luting cement
that is not fully removed after crown seating triggers a foreign-body
inflammatory response. The tissue loss looks identical to peri-implantitis and
is frequently misdiagnosed. The mechanism is preventable — raise the margin or
use a different retention system."
Do NOT write "complications can occur", "issues may arise", or any vague
hand-wave. Do NOT invent case numbers, percentages, or patient outcomes — use
[NEEDS EXPERT INPUT] inline for any specific rate or count.`.trim();

export const BATCH_SPECIFIC_NUMBERS_RULE = `
RULE 5 — SPECIFIC NUMBERS OVER RANGES:
Do not write "varies", "depends on", "typically", or "usually" without a specific
number in the same sentence. If a mapped unit provides a number, use it verbatim.
If no number is available, write either:
  (a) the literal sentence "No public data; ask the clinical team for current figures.", or
  (b) an inline [NEEDS EXPERT INPUT] placeholder in place of the missing number.
Never invent a number, never quote a range you have not been given, never write
"can vary depending on …" as a substitute for an answer.`.trim();

export const BATCH_NO_PASSIVE_FILLER_RULE = `
CRITICAL — NO PASSIVE FILLER:
You are completely forbidden from writing soft, defensive AI filler phrases.
Banned constructions include, but are not limited to: "typically symptoms of",
"may experience", "can experience", "results from a range of factors", "is
often caused by", "is generally considered", "is commonly associated with",
"plays a role in", "a variety of", "a range of", "a number of", "in some
cases", "for many people", "it is important to note", "it is worth noting".
Every statement must be direct, authoritative, and anchored to a concrete
data node from the mapped unit, retrieved chunks, or context files. If the
underlying fact is not in the supplied evidence, write [NEEDS EXPERT INPUT]
instead of generating a hedged sentence.`.trim();

export const BATCH_KEYWORD_NATURAL_LANGUAGE_RULE = `
KEYWORD NATURAL-LANGUAGE RULE:
Treat the article title as a topic, not a phrase to stuff into sentences. If the
title is a search query (e.g. "how can Invisalign fix an underbite"), it may
appear as the H1 and at most one H2. Do NOT repeat the exact query inside body
paragraphs, bullets, table cells, or FAQ answers. Translate it into natural
clinical language instead, such as "clear aligners can camouflage a dental
underbite" or "aligner treatment cannot correct a skeletal jaw discrepancy".`.trim();

export const BATCH_QUOTE_ATTRIBUTION_RULE = `
QUOTE ATTRIBUTION RULE (hard ban on fabricated or borrowed quotes):
Do NOT include quotation marks around any sentence presented as something a
clinician, expert, doctor, surgeon, orthodontist, dentist, specialist, or
"authority" said, unless ALL of these are true:
  (a) the exact quote text is supplied verbatim in the mapped unit or context
      files passed to you in this prompt, AND
  (b) the named speaker (full name + role/affiliation) is also supplied, AND
  (c) you attribute it inline as: "<Quote>" — <Full Name>, <Role>, <Affiliation>.
Do NOT use blockquotes ("> ...") at all unless conditions (a)-(c) are met.
ABSOLUTELY FORBIDDEN: phrases like "an expert noted", "a doctor said",
"a specialist commented", "First do no harm" as a standalone quote, generic
proverbs, nutrition/wellness metaphors ("the gut is like a garden", etc.),
or any quote pulled from your general training. If you do not have a real
attributed quote for this section, write the point in your own clinical prose
with no quotation marks.`.trim();

export const BATCH_SOURCED_FIGURES_RULE = `
SOURCED FIGURES RULE (currency, percentages, rates):
Any specific currency amount (e.g. "$1,256", "£890", "€1,400"), specific
percentage tied to a clinical claim (e.g. "73% of cases relapse"), or specific
volume/count ("12,400 cases per year") MUST either:
  (a) appear in the mapped unit / context files you were given, AND be cited
      inline as "(Source: <URL or publication>)" in the same sentence, OR
  (b) be replaced by the literal sentence "No public data; ask the clinical
      team for current figures." or an inline [NEEDS EXPERT INPUT] placeholder.
Do NOT invent specific dollar figures, lab fees, manufacturer prices, or
percentages. A removed number is always better than a fabricated one.`.trim();

export const BATCH_CONTRARIAN_RULE_NO_UNIT = `
RULE 6 — CONTRADICT CONSENSUS WHEN WARRANTED:
If the topic is built on a marketing term, a vague umbrella label, or a claim
that experienced clinicians routinely push back on, say so in plain language
early in the section. Examples of the form: "This term is mostly marketing, not
a clean technical category." or "Most articles claim X; in practice clinicians
see Y." You do not need a proprietary unit to apply this rule — apply it
whenever the consensus framing of the topic is weak, ambiguous, or commercially
motivated. Do NOT manufacture a contradiction where the consensus is genuinely
correct.`.trim();

export const BATCH_TABLE_GUARD_RULE = `
RULE 7 — MANDATORY MARKDOWN TABLE WITH MINIMUM 4 ROWS:
Every body section MUST contain exactly one Markdown pipe table. The table must have AT LEAST 4 data rows (not counting the header). Tables with fewer than 4 rows fail this rule.

Required format:
  | Column A | Column B | Column C |
  | --- | --- | --- |
  | row 1 data | row 1 data | row 1 data |
  | row 2 data | row 2 data | row 2 data |
  | row 3 data | row 3 data | row 3 data |
  | row 4 data | row 4 data | row 4 data |

Rules:
- MINIMUM 4 rows. If the section only has 2 or 3 distinct items, break each into sub-types, variants, time periods, or edge cases to reach 4 rows.
- Columns must be real decision dimensions from this section (e.g. "Era | Rule | Game Length | Impact").
- Rows must be named alternatives, criteria, time periods, player types, or specific cases from the section content.
- At least ONE column must contain numeric data (percentages, counts, durations, measurements, years, rates).
- NEVER use generic placeholder rows: "Standard case", "Edge case", "Option A/B/C", "Type 1/2/3".
- Do not invent statistics. If a number does not exist in the section, use a descriptive label instead.
- A table with 4 real rows always beats a table with 2 perfect rows.`.trim();

export const BATCH_AI_EXTRACTION_RULES = `
AI EXTRACTION RULES (apply to every section, every business type — additive to Rules 1–8; do NOT override any earlier rule):

RULE 9 — ANSWER PROXIMITY:
The direct answer to the article's primary question must appear in the first 80
words of the article body, before any explanation or context. Every article
must open with a self-contained answer sentence containing at least one
specific number or verifiable claim. Pages that bury the answer after an
introduction are bypassed by AI retrieval systems. No word-count threshold is
imposed on the answer sentence itself — only on its position.

RULE 10 — SELF-CONTAINED SENTENCES:
Every sentence in every body section must make complete logical sense if
extracted without its surrounding context. No sentence may rely on a pronoun
reference to a previous sentence to carry its meaning (avoid "This is why…",
"That makes it…", "These are the…" as sentence openers without restating the
noun). No sentence may use unverifiable qualitative claims such as "high
quality", "world-class", "affordable", "premium", "cutting-edge", or
"best-in-class" without a specific supporting fact in the same sentence.

RULE 11 — METHODOLOGY DISCLOSURE:
Every article containing statistics, price ranges, timelines, or comparative
data must include one explicit methodology sentence explaining how that data
was gathered. Format: "This data was compiled from [specific source or
method]." Original methodology-disclosed data receives significantly higher
AI visibility than data presented without attribution. Place this sentence
immediately after the first data-containing section. One methodology sentence
per article is sufficient; do not repeat it in every section.

RULE 12 — INFORMATION GAIN OVER CONSENSUS:
Never summarise what other websites already say. If the knowledge input
contains information already widely available, include it only as brief
framing context (one sentence maximum). Every body section must contain at
least one data point, observation, or conclusion not available on competing
pages. If no such information exists in the knowledge input for this section,
output the literal inline placeholder:
[NEEDS EXPERT INPUT: describe what proprietary data would strengthen this section]
rather than padding with consensus material.

RULE 13 — BUYER JOURNEY STAGE MATCHING:
Every article is written for ONE specific stage of the buyer journey:
  - Discovery — broad cost and comparison questions.
  - Validation — deadline, turnaround, and specification questions.
  - Execution — how to order, what information to prepare, what happens next.
Identify which stage the article topic matches and structure every section to
answer that stage's specific questions completely. Do not mix stages in one
article. If the title is a Discovery question, do not slide into Execution
checklists, and vice versa.

RULE 14 — OFF-SITE QUOTABILITY:
Every article must be written as if it will be quoted by a third-party source.
85% of brand mentions in AI answers come from off-site sources, not the
brand's own domain. Every key claim should be phrased as a standalone
quotable statement. The brand or business name must appear naturally in
context at least twice per article so it travels with the data when extracted
by AI systems. Write to invite citation, not just to rank.

RULE 15 — GHOST CITATION PREVENTION:
AI systems frequently cite a URL without naming the brand. To prevent
anonymous citation, the brand or business name must appear in the first
paragraph, in at least one body section heading or subheading, and in the
final thoughts section. It must appear as the SUBJECT of a sentence, not just
as a possessive modifier. Correct: "Big League Shirts analysed pricing across
50 bowling alleys." Incorrect: "the Big League Shirts pricing guide."

RULE 16 — MULTI-ENGINE DATA DENSITY:
AI engines in high reasoning mode cite 4.5 sources per response versus 2.6
in minimal mode, and 3 out of 4 cited domains differ between reasoning modes.
Different AI engines agree on only 11% of cited sources. Every article must
therefore contain at least four independently citable facts, each with a
specific number or named source, so the content is useful across different
retrieval modes and different AI engines — not optimised for one engine
only.

RULE 17 — PARAGRAPH LENGTH:
No prose paragraph may exceed 3 sentences. If a point requires more than
3 sentences of explanation, convert the extra sentences into a bulleted list
immediately below the paragraph. Never write more than 3 consecutive
sentences in a single paragraph block in any section.`.trim();

export const BATCH_FRAMING_LITE_RULES = `
FRAMING SECTION RULES:
- Lead with a direct sentence, no filler openers (Rule 2).
- Do not invent numbers, names, citations, or quotes. If the article body
  contains numbers, you may summarise them; do not introduce new ones.
- Avoid "varies / depends on / typically / usually" without a specific number
  carried over from the body (Rule 5).
- Never write bracket placeholders such as [Client Name], [Service Business
  Name], [Practice Name], or [NEEDS EXPERT INPUT]. Omit the sentence instead.
- Stay within the section's word budget and structural format.`.trim();

export const BATCH_OPENING_LENGTH_RULE = `
OPENING PARAGRAPH — DIRECT ANSWER REQUIRED:
Write one concise opening paragraph only, 55-85 words. This paragraph IS the answer.
A reader who reads only this paragraph must know the core answer — not that a
difference exists, but WHAT the difference is; not that a cost varies, but WHAT
the actual cost range is; not that a process matters, but HOW it works.

SENTENCE 1 (mandatory): Directly answer the article headline. State the actual
answer with at least one specific fact — a number, named material, measurement,
temperature, named process, or concrete differentiator. Never open with "X and Y
are not the same", "X is complex", "There are many factors", "Understanding X is
important", or any sentence that names the topic without answering it.

SENTENCES 2-3: Add one or two supporting specifics that complete the answer.
Each must introduce a new concrete fact not already in sentence 1.

Do not add a second paragraph. No bracket placeholders. No brand or clinic names
unless the exact name was supplied in the prompt.`.trim();

export const BATCH_OPENING_REFRAME_RULE = `
OPENING REFRAME (mandatory for marketing-umbrella topics):
Inspect the article title. If the title is built on a marketing umbrella term
(words such as "screwless", "painless", "minimally invasive", "natural",
"holistic", "revolutionary", "advanced", "smart", "next-generation", "premium",
"clinical-grade", or any branded/qualifier-led label that bundles multiple
distinct technical approaches), your VERY FIRST sentence MUST reframe it
using this pattern (vary the wording, keep the substance):
  "<Topic term> is mostly marketing language, not a clean technical category."
Then immediately, in the same paragraph, (a) state what the umbrella actually
contains (the 2-3 underlying real technical categories), and (b) explain why
the distinction matters for the reader's decision.
If the title is NOT a marketing umbrella term (e.g. "Sequential reaming
protocol for posterior implants"), ignore this rule and lead with a direct
factual claim instead.`.trim();

export const BATCH_FINAL_THOUGHTS_RULE = `
FINAL THOUGHTS RULE:
Write exactly two short paragraphs, 1-2 sentences each, 90-130 words total.
The first paragraph must summarise the decision or distinction. The second
paragraph must give the practical next step. Do not use bullets, tables, brand
placeholders, client placeholders, or [NEEDS EXPERT INPUT].`.trim();

export const BATCH_FAQ_DIRECT_ANSWER_RULE = `
FAQ DIRECT-ANSWER RULE:
This is an FAQ section. Each Q&A pair MUST follow this contract:
  - The answer's FIRST sentence is a direct, specific answer to the question.
  - At least one concrete specific (a real category name, a real mechanism,
    a number from earlier in the article, or a named tradeoff) appears in
    the answer.
  - "Costs vary", "it depends", "consult your professional", "many factors",
    or any other non-answer is FORBIDDEN as a substitute for the answer.
  - If a number is genuinely unknown, write the answer without a number —
    use a category-level distinction instead (e.g. "Friction-fit systems
    typically cost more than standard screw-retained because the components
    are manufactured to tighter tolerances and the procedure requires more
    technique time.") — never a hedge.
Format: EXACTLY this Markdown structure for each Q&A pair, with one blank
line between pairs:

**Question text ending with a question mark?**

Answer paragraph of 2-4 sentences on the next line(s).

Produce EXACTLY 5 Q&A pairs (no fewer, no more). Do NOT prefix questions
with "Q:" or answers with "A:". The question MUST be wrapped in **bold**
markers on its own line so downstream rendering picks it up as a FAQ entry.`.trim();

export function batchBuildAtomicBodyStructureRule(sectionBudgetWords: number): string {
  const isLarge = sectionBudgetWords >= 300;
  const isVeryLarge = sectionBudgetWords >= 500;
  const h3Count = isVeryLarge ? 3 : isLarge ? 2 : 0;
  const minWords = Math.round(sectionBudgetWords * 0.75);

  const base = `ATOMIC SECTION STRUCTURE (mandatory for every body section):
MINIMUM ${minWords} words. Target: ${sectionBudgetWords} words. You MUST write at least ${minWords} words — short sections will be rejected.

Base layer (always required):
  1. ONE standalone answer paragraph (2-3 sentences; 80-150 words) that fully
     answers the section heading on its own. It must read as a complete answer
     if extracted in isolation by an AI assistant.
  2. A blank line.
  3. EXACTLY 3 markdown bullets ("- " prefix), each one a single concrete,
     specific, actionable point. Each bullet is 1 sentence, 14-25 words. No
     sub-bullets. No fewer than 3, no more than 3.`;

  if (h3Count === 0) {
    return base + `

Do NOT add a sub-heading inside the section. Do NOT add a second paragraph
after the bullets. Every section stands alone — no cross-references.`;
  }

  return base + `

Expansion layer (required to meet the word budget):
  4. Add ${h3Count} H3 sub-sections (### Heading) below the bullets. Each
     sub-section must follow the same atomic pattern: one answer paragraph
     (80-150 words) + blank line + exactly 3 bullets (14-25 words each).
  5. Where data supports it, add ONE markdown table (4+ rows) inside the
     section — either after the base bullets or inside one H3 sub-section.
  6. You MAY add a second paragraph after the base bullets only if it
     introduces a table or transitions into the first H3 sub-section.

Do NOT cross-reference other sections. Every sentence must stand alone.`;
}

export function batchBuildInlineSourceLinkRule(allowed: AllowedSourceUrl[]): string {
  const valid = allowed.filter((s) => s && s.url && /^https?:\/\//i.test(s.url)).slice(0, 8);
  if (valid.length > 0) {
    return `INLINE SOURCE LINK (mandatory for this body section):
Include EXACTLY ONE inline markdown link in this section, formatted as
"[anchor text](URL)", with the URL chosen from the ALLOWED SOURCES list
below. Pick the single URL most relevant to this section's heading. The
anchor text must be a natural noun phrase from your prose (3-7 words) — not
the bare URL, not "click here", not "source", not the publication name on
its own. Place the link inside the standalone answer paragraph OR inside one
of the three bullets, wherever it reads most naturally. Do NOT invent URLs.
Do NOT use any URL not on this list. Do NOT add more than one link.

ALLOWED SOURCES (pick exactly one URL):
${valid.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join("\n")}`.trim();
  }
  return `INLINE SOURCE LINK (context-only mode):
No allow-listed external URLs are available for this article. Do NOT invent
URLs and do NOT insert inline markdown links. The system will list the
underlying context documents in a final References section automatically.`.trim();
}

// ─── Static prompt block ──────────────────────────────────────────────────────

export interface StaticPromptInput {
  businessType: BusinessType;
  audienceSentence: string;
  publicationDestination: "ai-search" | "human-blog" | "both";
  articleTitle: string;
  toneProfile?: { summary: string | null; characteristics: Record<string, string>; example_phrases: string[] | null } | null;
  contextFiles?: Array<{ name: string; content: string }>;
  valuePromiseBlock?: string;
  gapKeywordBlock?: string;
}

export interface StaticPromptBlock {
  /** Article-level system prefix (baseIdentity + tone + audience + destination + title).
   *  Byte-identical prefix of assembleSectionPrompt's system for the same inputs. */
  systemHeader: string;
  /** Full context files block for the user message. Empty string if no files. */
  contextFilesBlock: string;
  /** Value promise hard requirement. Null if no value promises. */
  valuePromiseReq: string | null;
  /** Gap/keyword guidance. Null if no gap block. */
  gapKeywordGuidance: string | null;
}

export function buildStaticPromptBlock(input: StaticPromptInput): StaticPromptBlock {
  const { businessType, audienceSentence, publicationDestination, articleTitle, toneProfile, contextFiles, valuePromiseBlock, gapKeywordBlock } = input;

  // Byte-identical copies of the strings produced inside assembleSectionPrompt.
  // These MUST stay in sync with proprietaryPromptAssembler.ts.
  const baseIdentity = `You are a proprietary-content writer for a ${businessType} business.
You write sections one at a time. You produce non-commodity content grounded in the
mapped knowledge unit provided for THIS section, or — when no unit is mapped — in
direct clinical reasoning. You never invent specific numbers, case counts, named
patients, or fabricated citations. You never write generic filler. You never use
em dashes, en dashes, or horizontal rules. You never output bracket placeholders
such as [Client Name], [Service Business Name], [Practice Name], [Your Business
Name], or [NEEDS EXPERT INPUT].`;

  const audienceBlock = `AUDIENCE: ${audienceSentence}`;
  const destinationBlock = `PUBLICATION DESTINATION: ${publicationDestination} — ${
    publicationDestination === "ai-search"
      ? "optimise for AI citation: dense factual claims, short paragraphs, named sources."
      : publicationDestination === "human-blog"
        ? "optimise for human reading: clear flow, illustrative examples, scannable structure."
        : "balance both: dense facts in topic sentences, illustrative detail in supporting sentences."
  }`;

  // toneBlock replicates the exact ternary in assembleSectionPrompt.
  // When toneProfile is null, this is null — Array.join converts null to "".
  const toneBlock = toneProfile ? (() => {
    const chars = Object.entries(toneProfile.characteristics || {})
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    const phrases = toneProfile.example_phrases?.length
      ? `\nExample phrases that match this voice (write like this):\n${toneProfile.example_phrases.map((p: string, i: number) => `${i + 1}. "${p}"`).join("\n")}`
      : "";
    return `TONE OF VOICE — HIGHEST PRIORITY RULE:
Your writing MUST match this tone profile. Short sentences. Plain language. Every sentence in this voice.

Voice summary: ${toneProfile.summary || "Not specified"}
${chars ? `\nVoice characteristics:\n${chars}` : ""}${phrases}

CRITICAL: If the tone is conversational, use short sentences under 20 words. Never start with "While", "Although", "Given that", or "It is important to note".`;
  })() : null;

  // Replicate the exact join from assembleSectionPrompt (null → "" in Array.join):
  // [ baseIdentity, toneBlock, audienceBlock, destinationBlock, ARTICLE TITLE,
  //   SECTION: heading, ruleBlocks ].join("\n\n")
  // Static header = elements 0-4 joined identically.
  const systemHeader = [
    baseIdentity,
    toneBlock,
    audienceBlock,
    destinationBlock,
    `ARTICLE TITLE: ${articleTitle}`,
  ].join("\n\n");

  // Context files block — replicated verbatim from assembleSectionPrompt.
  let contextFilesBlock = "";
  if (contextFiles && contextFiles.length > 0) {
    const contextBlock = contextFiles
      .map((f) => `--- ${f.name} ---\n${f.content}`)
      .join("\n\n");
    contextFilesBlock =
      "🚨 PRIMARY SOURCE OF TRUTH — UPLOADED CONTEXT FILES (HIGHEST PRIORITY).\n" +
      "These files override every other knowledge source for this section. Pull " +
      "raw, unvarnished data points directly from them: exact numbers, named " +
      "timelines, dosages, eligibility criteria, contraindications, study " +
      "names, percentages, and specific medical/clinical criteria. Quote the " +
      "files verbatim where a phrase is diagnostic. Do not paraphrase a fact " +
      "into a softer summary. Do not invent figures absent from these files. " +
      "If a required fact is missing, write [NEEDS EXPERT INPUT] instead of " +
      "filling the gap with general knowledge.\n\n" +
      contextBlock;
  }

  // Value promise requirement — replicated from assembleSectionPrompt.
  const valuePromiseReq = valuePromiseBlock
    ? `HARD REQUIREMENT — VALUE PROMISES: This article was written to fulfil these specific reader outcomes. This section MUST directly address at least one of them with specific facts, numbers, or named criteria:\n${valuePromiseBlock.replace("VALUE PROMISES — the reader expects ALL of these specific outcomes. Every section must directly address at least one:\n", "")}`
    : null;

  // Gap/keyword guidance — replicated from assembleSectionPrompt.
  const gapKeywordGuidance = gapKeywordBlock
    ? `SECONDARY GUIDANCE — COMPETITOR GAPS & TARGET KEYWORDS (weave in where relevant; never override value promises or invent facts to satisfy these):\n${gapKeywordBlock}`
    : null;

  return { systemHeader, contextFilesBlock, valuePromiseReq, gapKeywordGuidance };
}

// ─── Byte-identity assertion ──────────────────────────────────────────────────

/**
 * Verifies that buildStaticPromptBlock produces a systemHeader that is a
 * byte-identical prefix of assembleSectionPrompt's system output.
 *
 * Call this once per request when USE_BATCHED_PROMPT=true, passing a sample
 * assembled system (from assembleSectionPrompt with any body section and the
 * same article-level inputs). Throws if parity fails.
 */
export function assertStaticBlockByteParity(
  block: StaticPromptBlock,
  assembledSystem: string,
): void {
  // assembleSectionPrompt joins: [staticHeader, SECTION: heading, rules].join("\n\n")
  // So assembledSystem must start with block.systemHeader + "\n\n"
  const expectedPrefix = block.systemHeader + "\n\n";
  if (!assembledSystem.startsWith(expectedPrefix)) {
    const got = assembledSystem.slice(0, expectedPrefix.length + 80);
    throw new Error(
      `STATIC PROMPT BLOCK BYTE-IDENTITY FAILURE\n` +
      `Expected prefix (${expectedPrefix.length} chars):\n${expectedPrefix.slice(0, 200)}\n\n` +
      `Actual system start (${got.length} chars shown):\n${got}\n\n` +
      `Diff begins at char ${[...expectedPrefix].findIndex((c, i) => c !== assembledSystem[i])}`,
    );
  }
  console.log(`✓ Static prompt block byte-identity assertion passed (prefix ${block.systemHeader.length} chars).`);
}
