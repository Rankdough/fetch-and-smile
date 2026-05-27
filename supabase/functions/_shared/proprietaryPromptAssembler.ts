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

const KEYWORD_NATURAL_LANGUAGE_RULE = `
KEYWORD NATURAL-LANGUAGE RULE:
Treat the article title as a topic, not a phrase to stuff into sentences. If the
title is a search query (e.g. "how can Invisalign fix an underbite"), it may
appear as the H1 and at most one H2. Do NOT repeat the exact query inside body
paragraphs, bullets, table cells, or FAQ answers. Translate it into natural
clinical language instead, such as "clear aligners can camouflage a dental
underbite" or "aligner treatment cannot correct a skeletal jaw discrepancy".`.trim();

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
RULE 7 — TOPIC-DERIVED TABLE COLUMNS (no generic placeholders):
If a comparison table fits this section, derive BOTH the columns and the rows
from the actual technical categories of the topic.
  - Columns must be dimensions a clinician/buyer would compare on
    (e.g. "System Type | How Retention Works | Screw Present? | Primary Risk",
    or "Material | Tensile Strength | Cure Time | Failure Mode").
  - Rows must be the real named alternatives in this topic (e.g. for dental
    implants: "Cement-retained crown", "Friction-fit / Morse taper",
    "Traditional screw-retained" — NOT "Option A / B / C").
ABSOLUTELY FORBIDDEN row or column labels: "Option A/B/C", "Type 1/2/3",
"Beginner / Intermediate / Advanced", "Best for: beginners", "Choice 1/2/3",
or any other template placeholder. If you cannot name the real categories with
confidence, do NOT include a table — write a prose comparison instead. A
missing table is always better than a generic one.
If the topic is clear-aligner underbite correction, the comparison table should
use real rows such as "Dental underbite", "Skeletal underbite", and "Combined
pattern", with columns such as "Definition", "Invisalign suitable?", "Typical
timeline", and "Key risk if misdiagnosed". Do NOT translate those clinical
categories into generic options.`.trim();

const FRAMING_LITE_RULES = `
FRAMING SECTION RULES:
- Lead with a direct sentence, no filler openers (Rule 2).
- Do not invent numbers, names, citations, or quotes. If the article body
  contains numbers, you may summarise them; do not introduce new ones.
- Avoid "varies / depends on / typically / usually" without a specific number
  carried over from the body (Rule 5).
- Stay within the section's word budget and structural format.`.trim();

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
Format: 3-5 Q&A pairs. Each question on its own line as bold prefixed with
"Q:". Each answer follows as 2-4 sentences.`.trim();

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

export function assembleSectionPrompt(input: AssemblerInput): AssembledPrompt {
  const { businessType, mappedUnit, audienceSentence, publicationDestination, section, articleTitle } = input;
  const isBody = section.type === "body";
  const applied: number[] = [];

  // System prompt assembly
  const baseIdentity = `You are a proprietary-content writer for a ${businessType} business.
You write sections one at a time. You produce non-commodity content grounded in the
mapped knowledge unit provided for THIS section, or — when no unit is mapped — in
direct clinical reasoning. You never invent specific numbers, case counts, named
patients, or fabricated citations. You never write generic filler. You never use
em dashes, en dashes, or horizontal rules.`;

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
  } else {
    ruleBlocks.push(FRAMING_LITE_RULES);
    ruleBlocks.push(KEYWORD_NATURAL_LANGUAGE_RULE);
    // Framing inherits rules 2 and 5 conceptually
    applied.push(2, 5);

    // Opening framing section: enforce the marketing-umbrella reframe.
    if (section.kind === "opening") {
      ruleBlocks.push(OPENING_REFRAME_RULE);
      applied.push(6);
    }

    // FAQ framing section: enforce direct-answer contract.
    if (section.kind === "faq") {
      ruleBlocks.push(FAQ_DIRECT_ANSWER_RULE);
      applied.push(5); // re-emphasise no-hedge for FAQ specifically
    }

    // Quick Tips framing section: enforce exactly 3 actionable tips.
    if (section.kind === "quick-tips") {
      ruleBlocks.push(`QUICK TIPS RULE:
Output EXACTLY 3 markdown bullet points. Each bullet is one actionable
sentence (max 18 words) that a reader can act on before their next clinical
appointment. No filler ("consider", "think about", "be aware that"). Each
tip must reference a real category, decision, or check from the body
sections — not a generic platitude.`);
      applied.push(2);
    }
  }

  const system = [
    baseIdentity,
    audienceBlock,
    destinationBlock,
    `ARTICLE TITLE: ${articleTitle}`,
    `SECTION: ${section.heading} (kind: ${section.kind})`,
    ruleBlocks.join("\n\n"),
  ].join("\n\n");

  // User message: the unit + surrounding context + the explicit ask
  const userParts: string[] = [];
  userParts.push(describeMappedUnit(mappedUnit));
  const ctx = describeSurroundingContext(input.surroundingContext);
  if (ctx) userParts.push(ctx);
  userParts.push(`TASK: Write the body of the section "${section.heading}" now.
- Output Markdown only (no front-matter, no code fences).
- Do NOT repeat the H2 heading; the system inserts it.
- Obey every rule in the system message.`);

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
