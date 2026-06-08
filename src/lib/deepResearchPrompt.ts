// Shared deep-research prompt builder.
// Forces external AI tools (Gemini Deep Research, ChatGPT, Perplexity) to anchor
// findings in high-authority sources instead of SEO blogs / lead-gen directories.
// Topic-agnostic: works for health, automotive, audio, sport, finance, etc.
// v2: information gap analysis, non-commodity audit, direct answers per keyword cluster,
//     keyword-to-promise map, locked [title](url) citation format for parse-context-file.

export interface DeepResearchInput {
  title: string;
  topic: string;
  topicDescription?: string;
  ideaDescription?: string;
  strategicAngle?: string;
  targetKeywords?: string[];
  valuePromises?: string[];
}

export function buildDeepResearchPrompt(input: DeepResearchInput): string {
  const {
    title,
    topic,
    topicDescription = "",
    ideaDescription = "",
    strategicAngle = "",
    targetKeywords = [],
    valuePromises = [],
  } = input;

  const keywordLine = targetKeywords.length ? targetKeywords.join(", ") : "N/A";

  const promisesBlock = valuePromises.length
    ? valuePromises
        .map(
          (vp, i) => `**PROMISE ${i + 1}**
Return the complete dataset this promise requires. Every row of every table must be filled. Every rule reference must include the exact rule number and quoted text. Every numeric claim must include the figure, date, jurisdiction, and source URL. If the dataset contains a fact not found in a standard encyclopedia or Wikipedia summary of this topic, mark it ✓ NON-COMMODITY. If everything is generic knowledge, mark it ⚠ COMMODITY-RISK.

Promise: ${vp}`
        )
        .join("\n\n")
    : "N/A";

  return `You are a research analyst producing a structured fact brief for a content editor. Be direct. No filler. No introductions. Start with the data.

---

## SOURCES

Apply this test mechanically to every source. No judgement required.

**Acceptable sources — URL must match one of these:**
- Ends in \`.gov\`, \`.edu\`, \`.ac.xx\` (any country academic TLD), or \`.mil\`
- Named academic journal database with a DOI, named authors, and institutional affiliation: pubmed.ncbi.nlm.nih.gov, pmc.ncbi.nlm.nih.gov, cochranelibrary.com, sciencedirect.com, springer.com, wiley.com, tandfonline.com, nature.com, bmj.com, thelancet.com, jamanetwork.com, journals.sagepub.com, academic.oup.com, researchgate.net, ieee.org, arxiv.org
- Official published rulebook or official statistics page of the named governing body for this topic (e.g. mlb.com/official-rules, fifa.com/laws, worldathletics.org/rules, nfhs.org, ncaa.org)
- Recognised standards body: astm.org, iso.org, aatcc.org, ieee.org, nist.gov, bsi.group, who.int, cdc.gov, nhs.uk, nice.org.uk, fda.gov, ema.europa.eu

**Not acceptable — omit regardless of how credible the site appears:**
- Any blog post, listicle, "Top 10", "Best X", or comparison page
- Reddit, Quora, Medium, Pinterest, YouTube, any social or Q&A platform
- Wikipedia (find the primary source Wikipedia cites instead)
- WebMD, Healthline, Verywell, or any consumer health aggregator
- AI-generated content farms, eHow, WikiHow, Answers.com
- Any page whose primary purpose is to sell a product or capture a lead
- Any competitor commercial website

**Citation format — mandatory throughout this entire document:**
Every source must be formatted exactly as:
\`[Full page title as it appears on the page](https://exact-url)\`

Never construct or guess a URL. If you are not certain a URL resolves to a real page, omit the source. A missing citation is better than a hallucinated one.

---

## ARTICLE

**Title:** ${title}
**Topic cluster:** ${topic}${topicDescription ? ` — ${topicDescription}` : ""}
**Article concept:** ${ideaDescription || "N/A"}
**Strategic angle:** ${strategicAngle || "N/A"}
**Target keywords:** ${keywordLine}

---

## SECTION 1 — INFORMATION GAP ANALYSIS

Do this first, before any other research.

Take the three highest-volume target keywords. For each one:
1. State the correct, complete answer in one sentence (max 30 words), sourced from an acceptable URL.
2. State what the most common incomplete or wrong answer is that currently dominates search results, and why it is wrong.
3. State the gap — the specific fact, figure, rule, or nuance the correct answer contains that the common answer omits.

| Keyword | Correct complete answer (sourced) | What current results get wrong | The gap |
|---|---|---|---|

If you cannot find a sourced correct answer for a keyword, mark it ⚠ UNSOURCED. The editor will revise the value promise before the article is written.

---

## SECTION 2 — DIRECT ANSWERS PER KEYWORD CLUSTER

Group the target keywords by shared search intent — questions that need the same answer share one cluster. For each cluster, write one direct answer sentence (maximum 30 words) that fully and correctly answers the question. These become the article's opening paragraph and TL;DR.

**Cluster:** [list keywords in this cluster]
**Direct answer:** [one sentence, max 30 words]
**Source:** [title](url)

Mark any direct answer that cannot be sourced: ⚠ UNSOURCED.

---

## SECTION 3 — VALUE PROMISE DATASETS

${promisesBlock}

---

## SECTION 4 — KEYWORD TO PROMISE MAP

For each target keyword, state which value promise delivers its complete answer. If a keyword is not covered by any promise, flag it as ⚠ GAP — the editor must add a promise or the article will not rank for that keyword.

| Keyword | Answered by Promise # | Direct answer sentence (from Section 2) |
|---|---|---|

---

## SECTION 5 — NON-COMMODITY AUDIT

List three facts, figures, dates, or rulings from your research that:
- Come from an acceptable primary source above
- Do not appear in a standard encyclopedia or Wikipedia summary of this topic
- Would inform a reader who has already read the top three search results

If you cannot find three, state how many you found and flag the topic ⚠ COMMODITY-RISK — this topic may not support a genuinely differentiated article without original research.

---

## SECTION 6 — COMMON MISCONCEPTIONS

List up to five things that high-ranking search results currently get wrong about this topic, with the authoritative correction and source for each.

**Misconception:** [what the wrong content says]
**Correction:** [what the primary source actually says]
**Source:** [title](url)

---

## SECTION 7 — RECOMMENDED H2 STRUCTURE

Propose the H2 question structure for this article. Each H2 must be phrased as a real reader question, map to at least one target keyword, be answerable from the datasets in Section 3, and not duplicate another H2.

| H2 question | Keywords it targets | Promise it delivers | Primary source |
|---|---|---|---|

---

## SECTION 8 — VALUE PROMISE DATA AUDIT

For each value promise, confirm its status. Never silently skip a promise.

**PROMISE [N]: FULFILLED** — data in Section 3, sourced from [name](url), marked [NON-COMMODITY / COMMODITY-RISK]
**PROMISE [N]: PARTIALLY FULFILLED** — [exactly what was found] vs [exactly what is missing and why]
**PROMISE [N]: UNSOURCED** — [exactly what could not be found]. Editor must revise this promise before the article is written.

---

## REFERENCES

List every source cited in this document once. No duplicates. Format exactly as:
\`[Full page title](https://exact-url)\`

Group by type:
- Official governing body rulebooks and publications
- Academic journals and peer-reviewed studies
- Government and standards bodies
- Official manufacturer or trade body technical documentation

Omit any source you are not certain exists at the URL listed.`;
}
