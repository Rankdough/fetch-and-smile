// Shared VALUE PROMISE RULES.
// Enforces "non-commodity" / information-gain principles for AI-Overview-grade
// content: hard numbers, %, tables, direct answers to the searched question,
// and zero marketing fluff. Used by the cluster-keywords-enrich edge function
// for both single-idea and batch enrichment prompts.

export const VALUE_PROMISE_RULES = `VALUE PROMISE RULES (NON-COMMODITY — STRICT):
Each value promise is a single sentence describing a tangible, AI-quotable OUTCOME the reader walks away with. It must be the OPPOSITE of generic marketing copy — it must contain information a competing generalist page would not already have.

HARD CONTENT REQUIREMENTS (apply across the 5 promises taken together):
1. NUMERICAL DENSITY — at least 3 of the 5 promises MUST contain a hard numerical signal: a specific number, a range (e.g. "$4–$8"), a percentage, a ratio, a unit-bound metric (oz, drop, mph, sec, °F, sq m), a year, a threshold, or a formula.
2. DIRECT ANSWERS — at least 2 promises MUST be phrased as a direct answer (or direct comparison) to the actual search question implied by the target keywords — not a description of what will be "explored" or "analysed". Mirror the question's grammar.
3. STRUCTURED OUTPUT — at least 1 promise MUST commit to a comparison table, breakdown table, benchmark table, decision matrix, or ranked checklist (use the literal word "table", "matrix", "checklist", "ranking", or "breakdown" in the sentence).
4. METHODOLOGY OR PROPRIETARY SIGNAL — at least 1 promise should disclose how the answer was derived (sample size, sources audited, test protocol, dataset, year) or commit to original/aggregated data the reader will not find on a generalist page.
5. QUOTE-READY & SELF-CONTAINED — each sentence must stand alone as a factual unit: no pronouns referring outside itself, no "this guide explores", no "we cover".

PER-PROMISE RULES:
- One concise sentence each, max ~28 words.
- Tightly aligned with target_keywords; reflect their search intent (informational / commercial / decision).
- State the OUTCOME (what the reader will KNOW, COMPARE, or be able to DECIDE), never the action ("learn", "discover", "explore", "understand").
- Do NOT reveal the specific factual answer (e.g. don't write "9 innings"); commit to delivering it with the specific metric/format.

BANNED LANGUAGE (zero tolerance — regenerate any promise that contains these):
- Verbs aimed at the reader: Learn, Understand, Explore, Discover, Use, Follow, Check, Master, Unlock, Dive into, Get to grips with.
- Fluff nouns/adjectives: structured framework, comparative analysis, in-depth analysis, deep dive, comprehensive guide, ultimate guide, complete guide, holistic overview, premium, world-class, cutting-edge, best-in-class, informed decisions, key insights, valuable insights, actionable insights, tips, guide.
- Vague payoffs: "common mistakes", "things to consider", "factors to keep in mind", "what you need to know", "everything about".

GOOD EXAMPLES (numbers + direct answer + table commitment + methodology):
- "The exact number of innings in MLB, MiLB, college, high-school and Little League games, in a single 5-row comparison table."
- "How bat drop (-3 to -13) maps to swing speed gains in mph and exit velocity loss, quantified from a 50-swing test panel."
- "Per-square-metre construction costs for villas in Bali in 2026, broken down by material tier and finish level across a 3-column table."
- "The 6-criterion checklist that separates a tournament-legal Perfect Game bat from a banned one, with the exact USABat/USSSA stamp thresholds."

BAD EXAMPLES (commodity / fluff — reject):
- "A structured framework for evaluating bat performance metrics, allowing players to make informed decisions for their equipment choices."
- "A comparative analysis of how different bat weight/length combinations affect power generation versus bat control for various player profiles."
- "Common mistakes players make when selecting bat weight and length, leading to suboptimal performance or injury risk, and how to avoid them."`;
