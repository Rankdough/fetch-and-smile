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
If your mapped knowledge unit does not contain enough specific detail to support a
non-generic claim, output the single literal token [NEEDS EXPERT INPUT] as the
entire section body. Do NOT fill the gap with general knowledge, plausible-sounding
estimates, or rephrased common wisdom. The token is a feature, not a failure — it
tells the user exactly where their clinical knowledge is needed.`.trim();

const HONEST_ANSWER_RULE = `
RULE 2 — LEAD WITH THE HONEST ANSWER:
The first sentence of this section MUST be a direct claim or direct answer.
No preamble. No context-setting. No "it depends" opener. No "In today's world".
No "When it comes to". State the answer, then defend it.`.trim();

const CATEGORY_DISTINCTION_RULE_WITH_UNIT = `
RULE 3 — DISTINGUISH CATEGORIES BEFORE RECOMMENDING:
Your mapped knowledge unit contains a category distinction or trade-off. Surface
it explicitly before any recommendation. Name the categories, describe what
separates them, then state which category the recommendation applies to. Do not
collapse the distinction for readability.`.trim();

const CATEGORY_DISTINCTION_RULE_GENERIC = `
RULE 3 — DISTINGUISH CATEGORIES BEFORE RECOMMENDING:
If a category distinction applies to this topic (e.g. mild vs severe, dental vs
skeletal, adult vs paediatric), draw it before any recommendation. If no
distinction applies, skip this rule.`.trim();

const FAILURE_MODE_RULE = `
RULE 4 — FAILURE MODES MANDATORY:
This is a failure-mode section. It MUST describe a real failure mode drawn from
the mapped knowledge unit. Cover: what went wrong, why it went wrong, and what
the clinical team would do differently. If the mapped unit is missing or is not
of type "failure", output [NEEDS EXPERT INPUT] and nothing else.`.trim();

const SPECIFIC_NUMBERS_RULE = `
RULE 5 — SPECIFIC NUMBERS OVER RANGES:
Do not write "varies", "depends on", "typically", or "usually" without a specific
number in the same sentence. Pull numbers from the mapped knowledge unit. If the
unit contains no number for a claim that needs one, write the literal sentence:
"No public data; ask the clinical team for current figures." instead of hedging.`.trim();

const FRAMING_LITE_RULES = `
FRAMING SECTION RULES:
- Lead with a direct sentence, no filler openers (Rule 2).
- Do not invent numbers, names, citations, or quotes. If the article body
  contains numbers, you may summarise them; do not introduce new ones.
- Avoid "varies / depends on / typically / usually" without a specific number
  carried over from the body (Rule 5).
- Stay within the section's word budget and structural format.`.trim();

function describeMappedUnit(unit: MappedUnit | null): string {
  if (!unit) {
    return `MAPPED KNOWLEDGE UNIT: NONE.
No proprietary unit is mapped to this section. Per Rule 1, if you cannot write
this section using only specifics that would survive the no-commodity test,
output [NEEDS EXPERT INPUT] as the entire body.`;
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
mapped knowledge unit provided for THIS section. You never invent specifics. You
never write generic filler. You never use em dashes, en dashes, or horizontal rules.`;

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
      ruleBlocks.push(FAILURE_MODE_RULE);
      applied.push(4);
    }

    // Rule 5 — every body section
    ruleBlocks.push(SPECIFIC_NUMBERS_RULE);
    applied.push(5);
  } else {
    ruleBlocks.push(FRAMING_LITE_RULES);
    // Framing inherits rules 2 and 5 conceptually
    applied.push(2, 5);
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
