// Proprietary Mode prompt assembler.
// Pure module: no I/O, no Deno-specific APIs. Safe to import from any edge function
// or to unit-test in Node/Deno.
//
// Contract: assembleSectionPrompt(input) -> { system, user }.
// The six generation rules from the GPT-agent spec are baked in and conditionally
// enabled based on businessType, section.kind, and the mapped knowledge unit type.

export type BusinessType =
  | "service"
  | "ecommerce"
  | "saas"
  | "healthcare-clinical"
  | "manufacturer"
  | "publisher"
  | "other";

export type UnitType = "case" | "outcome" | "failure" | "tradeoff" | "contrarian";

export type SectionKind =
  // body
  | "h2-question"
  | "how-to-choose"
  | "failure-mode"
  // framing
  | "tldr"
  | "quick-tips"
  | "faq"
  | "opening"
  | "final-thoughts"
  | "references";

export interface MappedUnit {
  id: string;
  unit_type: UnitType;
  title: string | null;
  summary: string | null;
  full_text: string;
}

export interface SectionSpec {
  id: string;
  heading: string;
  kind: SectionKind;
  /** Loose intent: body sections enforce the six rules; framing sections get the lighter rule set. */
  type: "body" | "framing";
}

export interface AllowedSourceUrl {
  url: string;
  title: string;
}

export interface AssemblerInput {
  businessType: BusinessType;
  mappedUnit: MappedUnit | null;
  audienceSentence: string;
  publicationDestination: "ai-search" | "human-blog" | "both";
  section: SectionSpec;
  /** Previously generated sections, in order. Used for surrounding context (series generation). */
  surroundingContext?: Array<{ heading: string; content: string }>;
  /** Article-wide topic / title, for grounding. */
  articleTitle: string;
  /** Allow-listed external URLs the model may cite inline in this body section. */
  allowedSourceUrls?: AllowedSourceUrl[];
  /** Retrieved context snippets from uploaded research/context files for this exact section. */
  retrievedKnowledge?: Array<{ content: string; sourceTitle?: string | null }>;
  /** Full context files passed through from the request — used as PRIMARY SOURCE OF TRUTH. */
  contextFiles?: Array<{ name: string; content: string }>;
  /** Tone profile — enforces voice, sentence length, and writing style. Highest priority constraint. */
  toneProfile?: { summary: string | null; characteristics: Record<string, string>; example_phrases: string[] | null } | null;
  /** Value promise block — injected into every section so the model addresses all reader-expected outcomes. */
  valuePromiseBlock?: string;
}

export interface AssembledPrompt {
  system: string;
  user: string;
  /** Which rules were injected, for telemetry / debugging. */
  appliedRules: number[];
}

const NO_COMMODITY_RULE = `
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

const HONEST_ANSWER_RULE = `
RULE 2 — LEAD WITH THE HONEST ANSWER:
The first sentence of this section MUST be a direct claim or direct answer.
No preamble. No context-setting. No "it depends" opener. No "In today's world".
No "When it comes to". State the answer, then defend it. If the section heading
is a question, the first sentence answers it in plain language — even if the
honest answer is "this term is mostly marketing, not a clean technical category."`.trim();

const CATEGORY_DISTINCTION_RULE_WITH_UNIT = `
RULE 3 — DISTINGUISH CATEGORIES BEFORE RECOMMENDING:
Your mapped knowledge unit contains a category distinction or trade-off. Surface
it explicitly before any recommendation. Name the categories, describe what
separates them, then state which category the recommendation applies to. Do not
collapse the distinction for readability.`.trim();

const CATEGORY_DISTINCTION_RULE_GENERIC = `
RULE 3 — DISTINGUISH CATEGORIES BEFORE RECOMMENDING:
If a category distinction applies to this topic (e.g. mild vs severe, dental vs
skeletal, adult vs paediatric, marketing label vs technical category), draw it
explicitly before any recommendation. If the topic uses a marketing umbrella
term that bundles distinct technical approaches, name the underlying categories
and refuse to treat the umbrella as a clean clinical category.`.trim();

const FAILURE_MODE_RULE_WITH_UNIT = `
RULE 4 — FAILURE MODES MANDATORY:
This is a failure-mode section and a "failure" unit is mapped. Describe the
actual failure from the unit: what went wrong, why it went wrong, what the
clinical team would do differently. Use the unit's specifics verbatim.`.trim();

const FAILURE_MODE_RULE_NO_UNIT = `
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

const SPECIFIC_NUMBERS_RULE = `
RULE 5 — SPECIFIC NUMBERS OVER RANGES:
Do not write "varies", "depends on", "typically", or "usually" without a specific
number in the same sentence. If a mapped unit provides a number, use it verbatim.
If no number is available, write either:
  (a) the literal sentence "No public data; ask the clinical team for current figures.", or
  (b) an inline [NEEDS EXPERT INPUT] placeholder in place of the missing number.
Never invent a number, never quote a range you have not been given, never write
"can vary depending on …" as a substitute for an answer.`.trim();

// BUILD-2026-05-29-I: hard ban on passive AI filler. Pairs with RULE 5 and the
// Rule-5 repair gate so generated prose ships without hedge openers in the
// first place, rather than depending on a post-hoc rewrite.
const NO_PASSIVE_FILLER_RULE = `
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

const KEYWORD_NATURAL_LANGUAGE_RULE = `
KEYWORD NATURAL-LANGUAGE RULE:
Treat the article title as a topic, not a phrase to stuff into sentences. If the
title is a search query (e.g. "how can Invisalign fix an underbite"), it may
appear as the H1 and at most one H2. Do NOT repeat the exact query inside body
paragraphs, bullets, table cells, or FAQ answers. Translate it into natural
clinical language instead, such as "clear aligners can camouflage a dental
underbite" or "aligner treatment cannot correct a skeletal jaw discrepancy".`.trim();

const QUOTE_ATTRIBUTION_RULE = `
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

const SOURCED_FIGURES_RULE = `
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


const CONTRARIAN_RULE_NO_UNIT = `
RULE 6 — CONTRADICT CONSENSUS WHEN WARRANTED:
If the topic is built on a marketing term, a vague umbrella label, or a claim
that experienced clinicians routinely push back on, say so in plain language
early in the section. Examples of the form: "This term is mostly marketing, not
a clean technical category." or "Most articles claim X; in practice clinicians
see Y." You do not need a proprietary unit to apply this rule — apply it
whenever the consensus framing of the topic is weak, ambiguous, or commercially
motivated. Do NOT manufacture a contradiction where the consensus is genuinely
correct.`.trim();

const TABLE_GUARD_RULE = `
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

const AI_EXTRACTION_RULES = `
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

const ATOMIC_BODY_STRUCTURE_RULE = `
ATOMIC SECTION STRUCTURE (mandatory for every body section):
Write this section in this exact order, with nothing else inserted:
  1. ONE standalone answer paragraph (2-3 sentences, max 3; aim for 80-130
     words in medium or longer articles) that fully answers the section heading
     on its own. It must read as a complete answer if extracted in isolation by
     an AI assistant.
  2. A blank line.
  3. EXACTLY 3 markdown bullets ("- " prefix), each one a single concrete,
     specific, actionable point that supports or expands the answer. Each
      bullet is 1 sentence, 14-22 words. No sub-bullets. No nested lists. No
      fewer than 3, no more than 3. Each bullet must add a concrete detail not
      already stated word-for-word in the answer paragraph.
Do NOT add a sub-heading inside the section. Do NOT add a second paragraph
after the bullets. Do NOT use phrases like "as mentioned above", "as we saw
earlier", "continuing from earlier", "in the previous section", or any
reference to other sections — every section stands alone.`.trim();

const INLINE_SOURCE_LINK_RULE_WITH_URLS = (allowed: AllowedSourceUrl[]) => `
INLINE SOURCE LINK (mandatory for this body section):
Include EXACTLY ONE inline markdown link in this section, formatted as
"[anchor text](URL)", with the URL chosen from the ALLOWED SOURCES list
below. Pick the single URL most relevant to this section's heading. The
anchor text must be a natural noun phrase from your prose (3-7 words) — not
the bare URL, not "click here", not "source", not the publication name on
its own. Place the link inside the standalone answer paragraph OR inside one
of the three bullets, wherever it reads most naturally. Do NOT invent URLs.
Do NOT use any URL not on this list. Do NOT add more than one link.

ALLOWED SOURCES (pick exactly one URL):
${allowed.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join("\n")}`.trim();

const INLINE_SOURCE_LINK_RULE_NO_URLS = `
INLINE SOURCE LINK (context-only mode):
No allow-listed external URLs are available for this article. Do NOT invent
URLs and do NOT insert inline markdown links. The system will list the
underlying context documents in a final References section automatically.`.trim();

const FRAMING_LITE_RULES = `
FRAMING SECTION RULES:
- Lead with a direct sentence, no filler openers (Rule 2).
- Do not invent numbers, names, citations, or quotes. If the article body
  contains numbers, you may summarise them; do not introduce new ones.
- Avoid "varies / depends on / typically / usually" without a specific number
  carried over from the body (Rule 5).
- Never write bracket placeholders such as [Client Name], [Service Business
  Name], [Practice Name], or [NEEDS EXPERT INPUT]. Omit the sentence instead.
- Stay within the section's word budget and structural format.`.trim();

const OPENING_LENGTH_RULE = `
OPENING LENGTH RULE:
Write one concise opening paragraph only, 55-85 words. Do not add a second
paragraph. Do not mention a business, clinic, brand, editorial team, or service
name unless the exact name was supplied in the prompt. No bracket placeholders.`.trim();

const FINAL_THOUGHTS_RULE = `
FINAL THOUGHTS RULE:
Write exactly two short paragraphs, 1-2 sentences each, 90-130 words total.
The first paragraph must summarise the decision or distinction. The second
paragraph must give the practical next step. Do not use bullets, tables, brand
placeholders, client placeholders, or [NEEDS EXPERT INPUT].`.trim();

const OPENING_REFRAME_RULE = `
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

const FAQ_DIRECT_ANSWER_RULE = `
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

function describeMappedUnit(unit: MappedUnit | null): string {
  if (!unit) {
    return `MAPPED KNOWLEDGE UNIT: NONE.
No proprietary unit is mapped to this section. You must still produce a
non-commodity section using Rules 1, 2, 3, 5 and 6. That means: direct answer
first, category distinctions made explicit, contrarian framing where the
consensus is weak, and concrete failure mechanisms where they apply. Use
[NEEDS EXPERT INPUT] as an INLINE placeholder ONLY where a specific number,
case count, or proprietary outcome is required. Do not collapse the whole
section into the placeholder, and do not write a generic definitional answer
to dodge the constraint.`;
  }
  const header = `MAPPED KNOWLEDGE UNIT (type: ${unit.unit_type}${unit.title ? `, title: ${unit.title}` : ""}):`;
  const summary = unit.summary ? `Summary: ${unit.summary}` : "";
  const body = `Full unit text (this is your sole source for specifics in this section):\n"""\n${unit.full_text}\n"""`;
  return [header, summary, body].filter(Boolean).join("\n\n");
}

function describeSurroundingContext(prev: AssemblerInput["surroundingContext"]): string {
  if (!prev || prev.length === 0) return "";
  const items = prev
    .slice(-4) // cap to last 4 to keep prompt small
    .map((s) => `### Previously written: ${s.heading}\n${s.content.slice(0, 800)}${s.content.length > 800 ? "…" : ""}`)
    .join("\n\n");
  return `SURROUNDING CONTEXT — sections already written in this article. Do NOT repeat their claims; build on them.\n\n${items}`;
}

function describeRetrievedKnowledge(snippets: AssemblerInput["retrievedKnowledge"]): string {
  if (!snippets || snippets.length === 0) return "";
  const block = snippets
    .slice(0, 4)
    .map((s, i) => `### Context source ${i + 1}${s.sourceTitle ? `: ${s.sourceTitle}` : ""}\n${s.content.slice(0, 1400)}${s.content.length > 1400 ? "…" : ""}`)
    .join("\n\n");
  return `RETRIEVED CONTEXT FILE EVIDENCE — use these facts, distinctions, tables, and named source documents for this section. Prefer this evidence over general knowledge.\n\n${block}`;
}

export function assembleSectionPrompt(input: AssemblerInput): AssembledPrompt {
  const { businessType, mappedUnit, audienceSentence, publicationDestination, section, articleTitle, toneProfile, valuePromiseBlock } = input;
  const isBody = section.type === "body";
  const applied: number[] = [];

  // System prompt assembly
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

  const ruleBlocks: string[] = [];

  if (isBody) {
    // Rule 1 — every body section
    ruleBlocks.push(NO_COMMODITY_RULE);
    applied.push(1);

    // Rule 2 — every body section
    ruleBlocks.push(HONEST_ANSWER_RULE);
    applied.push(2);

    // Rule 3 — h2-question sections; specific text if unit carries a distinction
    if (section.kind === "h2-question") {
      const unitCarriesDistinction =
        mappedUnit && (mappedUnit.unit_type === "tradeoff" || mappedUnit.unit_type === "contrarian");
      ruleBlocks.push(unitCarriesDistinction ? CATEGORY_DISTINCTION_RULE_WITH_UNIT : CATEGORY_DISTINCTION_RULE_GENERIC);
      applied.push(3);
    }

    // Rule 4 — failure-mode sections, mandatory for service / healthcare-clinical
    if (section.kind === "failure-mode" && (businessType === "service" || businessType === "healthcare-clinical")) {
      const hasFailureUnit = mappedUnit && mappedUnit.unit_type === "failure";
      ruleBlocks.push(hasFailureUnit ? FAILURE_MODE_RULE_WITH_UNIT : FAILURE_MODE_RULE_NO_UNIT);
      applied.push(4);
    }

    // Rule 5 — every body section
    ruleBlocks.push(SPECIFIC_NUMBERS_RULE);
    applied.push(5);

    // BUILD-2026-05-29-I — hard ban on passive AI filler in body prose.
    ruleBlocks.push(NO_PASSIVE_FILLER_RULE);

    ruleBlocks.push(KEYWORD_NATURAL_LANGUAGE_RULE);

    // Rule 6 — h2-question sections always get contrarian licence when no
    // contrarian unit is mapped (the editor pass below handles the mapped case).
    if (section.kind === "h2-question" && (!mappedUnit || mappedUnit.unit_type !== "contrarian")) {
      ruleBlocks.push(CONTRARIAN_RULE_NO_UNIT);
      applied.push(6);
    }

    // Rule 7 — table guard on every body section. Models love generic
    // "Option A/B/C" templates; ban them outright.
    ruleBlocks.push(TABLE_GUARD_RULE);
    applied.push(7);

    // Quote + sourced-figures guards — every body section
    ruleBlocks.push(QUOTE_ATTRIBUTION_RULE);
    ruleBlocks.push(SOURCED_FIGURES_RULE);

    // Rules 9–16 — AI extraction rules, every body section, every business type.
    ruleBlocks.push(AI_EXTRACTION_RULES);
    applied.push(9, 10, 11, 12, 13, 14, 15, 16);

    // Atomic structure (standalone answer + exactly 3 bullets) and inline
    // source link — baked into generation so post-hoc guards rarely need to
    // fire.
    ruleBlocks.push(ATOMIC_BODY_STRUCTURE_RULE);
    applied.push(18);
    const allowed = (input.allowedSourceUrls || []).filter((s) => s && s.url && /^https?:\/\//i.test(s.url));
    if (allowed.length > 0) {
      ruleBlocks.push(INLINE_SOURCE_LINK_RULE_WITH_URLS(allowed.slice(0, 8)));
    } else {
      ruleBlocks.push(INLINE_SOURCE_LINK_RULE_NO_URLS);
    }
    applied.push(19);
  } else {
    ruleBlocks.push(FRAMING_LITE_RULES);
    ruleBlocks.push(NO_PASSIVE_FILLER_RULE);
    ruleBlocks.push(KEYWORD_NATURAL_LANGUAGE_RULE);
    ruleBlocks.push(QUOTE_ATTRIBUTION_RULE);
    ruleBlocks.push(SOURCED_FIGURES_RULE);
    // Framing inherits rules 2 and 5 conceptually
    applied.push(2, 5);

    // Rules 9–16 — AI extraction rules, every framing section, every business type.
    ruleBlocks.push(AI_EXTRACTION_RULES);
    applied.push(9, 10, 11, 12, 13, 14, 15, 16);


    // Opening framing section: enforce the marketing-umbrella reframe.
    if (section.kind === "opening") {
      ruleBlocks.push(OPENING_LENGTH_RULE);
      ruleBlocks.push(OPENING_REFRAME_RULE);
      applied.push(6);
    }

    if (section.kind === "final-thoughts") {
      ruleBlocks.push(FINAL_THOUGHTS_RULE);
    }

    // FAQ framing section: enforce direct-answer contract.
    if (section.kind === "faq") {
      ruleBlocks.push(FAQ_DIRECT_ANSWER_RULE);
      applied.push(5); // re-emphasise no-hedge for FAQ specifically
    }

    // TL;DR framing section: enforce 60-word cap.
    if (section.kind === "tldr") {
      ruleBlocks.push(`TLDR RULE: Maximum 60 words total. One short paragraph only. No bullets, no sub-headings, no links. Summarise the single most important takeaway from this topic in plain language.`);
    }

    // Quick Tips framing section: enforce exactly 3 actionable tips.
    if (section.kind === "quick-tips") {
      ruleBlocks.push(`QUICK TIPS RULE:\nOutput EXACTLY 3 bullet points. Each bullet is one actionable sentence (max 18 words) the reader can act on immediately. Use this format:\n\n- [Actionable tip referencing a specific criterion, check, or decision from this article.]\n- [Actionable tip referencing a specific criterion, check, or decision from this article.]\n- [Actionable tip referencing a specific criterion, check, or decision from this article.]\n\nNO filler. Each tip must name a specific action, check, or credential the reader can verify.`);
      applied.push(2);
    }
  }

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

  const system = [
    baseIdentity,
    toneBlock,
    audienceBlock,
    destinationBlock,
    `ARTICLE TITLE: ${articleTitle}`,
    `SECTION: ${section.heading} (kind: ${section.kind})`,
    ruleBlocks.join("\n\n"),
  ].join("\n\n");

  // User message: BUILD-2026-05-29-I — context files are promoted to the FIRST
  // structural block so the model treats them as the authoritative ground
  // truth, ahead of the mapped unit and retrieved chunks. Followed by an
  // explicit extraction directive ordering raw data nodes, named timelines,
  // and specific clinical/medical criteria — not summarised paraphrase.
  const userParts: string[] = [];
  if (input.contextFiles && input.contextFiles.length > 0) {
    const contextBlock = input.contextFiles
      .map((f) => `--- ${f.name} ---\n${f.content}`)
      .join("\n\n");
    userParts.push(
      "🚨 PRIMARY SOURCE OF TRUTH — UPLOADED CONTEXT FILES (HIGHEST PRIORITY).\n" +
        "These files override every other knowledge source for this section. Pull " +
        "raw, unvarnished data points directly from them: exact numbers, named " +
        "timelines, dosages, eligibility criteria, contraindications, study " +
        "names, percentages, and specific medical/clinical criteria. Quote the " +
        "files verbatim where a phrase is diagnostic. Do not paraphrase a fact " +
        "into a softer summary. Do not invent figures absent from these files. " +
        "If a required fact is missing, write [NEEDS EXPERT INPUT] instead of " +
        "filling the gap with general knowledge.\n\n" +
        contextBlock,
    );
  }
  userParts.push(describeMappedUnit(mappedUnit));
  const retrieved = describeRetrievedKnowledge(input.retrievedKnowledge);
  if (retrieved) userParts.push(retrieved);
  const ctx = describeSurroundingContext(input.surroundingContext);
  if (ctx) userParts.push(ctx);
  // Hard requirements appended to the task — these are the rules most
  // commonly failed at generation time. Stating them explicitly in the task
  // (not just the system prompt) significantly improves compliance.
  const hardRequirements = [
    "OUTPUT FORMAT: Markdown only. No front-matter, no code fences. Do NOT repeat the H2 heading.",
    "HARD REQUIREMENT — NUMERIC DENSITY: Include AT LEAST 3 specific numbers, percentages, or counts with units in this section. Example: '24 perfect games', '7.36%', '27 consecutive batters'. Vague claims without numbers fail.",
    "HARD REQUIREMENT — NO HEDGING: Do NOT use the words 'typically', 'varies', 'depends', 'generally', 'often', 'usually', 'may vary', or 'in some cases' unless the sentence also contains a specific number. Replace hedges with facts.",
    "HARD REQUIREMENT — METHODOLOGY (first data-containing section only): After the first sentence that contains a statistic or number, add one sentence in this exact format: 'This data was compiled from [specific named source].' Do this once per article, not per section.",
    "HARD REQUIREMENT — FIRST PARAGRAPH ≤45 WORDS: The very first paragraph of this section must be 45 words or fewer. It must directly answer the section heading question. Count your words.",
  ].join("\n");
  // Inject value promises into task so every section knows what outcomes to address
  if (valuePromiseBlock) userParts.push(valuePromiseBlock);

  userParts.push(`TASK: Write the body of the section "${section.heading}" now.

${hardRequirements}`);

  return { system, user: userParts.join("\n\n"), appliedRules: applied };
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule 5 deterministic lint pass.
   Runs after generation, before commodity check. Flags any sentence
   containing "varies / depends on / typically / usually" without a number
   in the same sentence.
   ───────────────────────────────────────────────────────────────────────── */

const RULE5_HEDGES = /\b(varies|depends on|typically|usually)\b/i;
const RULE5_NUMBER = /\d/;

export function lintRule5(text: string): string[] {
  // Naive sentence splitter — good enough for flagging; full NLP not needed here.
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z\[])/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const flagged: string[] = [];
  for (const s of sentences) {
    if (RULE5_HEDGES.test(s) && !RULE5_NUMBER.test(s)) {
      flagged.push(s);
    }
  }
  return flagged;
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule 6 — contradiction enrichment prompt builder.
   Only used when the mapped unit is of type "contrarian". The caller fires
   a secondary AI pass with this prompt to surface the contradiction.
   ───────────────────────────────────────────────────────────────────────── */

export function buildContradictionPrompt(args: {
  generatedSection: string;
  contrarianUnit: MappedUnit;
  sectionHeading: string;
}): { system: string; user: string } {
  const system = `You are a contradiction-surfacing editor. You receive a freshly
written section and a "contrarian" knowledge unit that contains evidence
contradicting conventional wisdom. Your job: decide whether the section
confirms what every other website says, and if so, rewrite it to surface the
contradiction explicitly. If the section already contradicts consensus, return
it unchanged.

Return your answer as JSON only, no prose, with this exact shape:
{ "contradicted": boolean, "rewritten": string }
- contradicted: true if you rewrote the section, false if you left it alone.
- rewritten: the final section text (rewritten OR unchanged).`;

  const user = `SECTION HEADING: ${args.sectionHeading}

CONTRARIAN UNIT (your source for the contradiction):
"""
${args.contrarianUnit.full_text}
"""

GENERATED SECTION (to evaluate):
"""
${args.generatedSection}
"""`;

  return { system, user };
}
