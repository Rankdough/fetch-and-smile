// Shared deep-research prompt builder.
// Forces external AI tools (Gemini Deep Research, ChatGPT, Perplexity) to anchor
// findings in high-authority sources instead of SEO blogs / lead-gen directories.
// Topic-agnostic: works for health, automotive, audio, sport, finance, etc.

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
  const promises = valuePromises.length
    ? valuePromises.map((vp, i) => `${i + 1}. ${vp}`).join("\n")
    : "N/A";

  return `You are acting as a Subject-Matter Expert, Policy/Standards Analyst, and Research Librarian for the topic below. Your output style is academic, objective, and analytical — similar to a clinical consensus paper or a regulatory briefing. No marketing fluff, no patient-friendly simplification, no introductory filler. Begin directly with the analysis.

ARTICLE TO RESEARCH
- Title: "${title}"
- Topic cluster: ${topic}${topicDescription ? ` — ${topicDescription}` : ""}
- Article concept: ${ideaDescription || "N/A"}
- Strategic angle: ${strategicAngle || "N/A"}
- Target keywords: ${keywordLine}

VALUE PROMISES THIS ARTICLE MUST DELIVER
${promises}

PRIMARY RESEARCH OBJECTIVE — COMPLETE VALUE PROMISE DATASETS
The value promises above are the article's contract with the reader. Your single most important job is to return the COMPLETE underlying dataset each promise requires, fully cited. Apply these rules:
- If a promise requires a comparison table, collect EVERY row and EVERY column value (each cell sourced). Partial tables are a failure.
- If a promise references specific rules, thresholds, or limits (e.g. mercy rules, run limits, scholarship caps), quote the exact rule text or figure from the governing rulebook, with section/rule number where available.
- If a promise concerns rationale, implications, or strategy, gather the documented reasoning from official sources (rule committee notes, governing body statements, published studies) — not inference.
- Where data varies by jurisdiction, division, age group, or season, capture the variance explicitly rather than generalising.

1. STRICT SOURCE HIERARCHY (THE ONLY ACCEPTABLE SOURCES OF TRUTH)

You are FORBIDDEN from citing, quoting, paraphrasing, or relying on any of the following:
- Commercial blogs from local providers, clinics, retailers, dealerships, or service businesses
- Lead-generation directories, comparison/affiliate sites, coupon sites, "best of" SEO listicles
- Cosmetic/marketing brochures, dental-tourism pages, sponsored content, press releases
- Consumer Q&A and social platforms (Reddit, Quora, Pinterest, Medium, Substack personal blogs, Facebook, TikTok, X/Twitter, YouTube comments)
- AI-generated content farms, eHow / WikiHow / Answers.com, ad-driven content mills
- Any page whose primary purpose is to sell a product or capture a lead

You MUST anchor every factual claim in one of the following authority tiers. Identify the tier for each citation.

Tier 1 — Primary Standards, Regulators, Policy Authorities
- Official government bodies and regulators relevant to the topic (e.g. NHS, NICE, CDC, FDA, EMA, NHTSA, FCC, EPA, EASA, ICAO, FCA, SEC, ASTM, ISO, IEC, IEEE, BSI, CEN, UN/ECE, OECD)
- Official governing bodies, sanctioning organisations, and published rulebooks of the relevant sport, activity, or industry (e.g. MLB Official Baseball Rules, NCAA rulebooks and bylaws, NFHS rules, Little League International regulations, World Athletics, FIFA Laws of the Game)
- National professional bodies, royal colleges, and chartered institutes (e.g. BDA, RCS, AMA, ACS, IET, IMechE, RIBA, CIPS)
- Statutory codes, official policy documents, prior-approval pathways, technical regulations and directives

Tier 2 — Peer-Reviewed Scientific, Clinical, Engineering & Academic Literature
- PubMed Central (PMC), MEDLINE, Cochrane, Scopus, Web of Science, IEEE Xplore, ACM, SSRN, NBER, arXiv (for established work only)
- Systematic reviews, meta-analyses, retrospective audits, service evaluations, published clinical trials
- Outputs from named teaching hospitals, university research groups, or government-funded labs (NIST, ORNL, Fraunhofer, CSIRO, Max Planck, etc.)

Tier 3 — Governmental / Legislative Oversight & Official Data
- National audit offices (e.g. NAO, GAO), parliamentary / congressional committee evidence and spending reviews
- Government statistical agencies (ONS, Eurostat, BLS, Statistics Canada, ABS)
- Central bank / treasury publications where economically relevant

Tier 4 — Authoritative Manufacturer & Industry Technical Documentation (use sparingly, only for product/spec claims)
- Manufacturer white papers, official spec sheets, service manuals, safety data sheets
- Standards-body certification documents and conformity assessments
- Recognised industry trade associations publishing technical (not promotional) research

2. REQUIRED RESEARCH DELIVERABLES

Produce a deep-dive structured as follows. Every numeric claim, percentage, threshold, cost, or date MUST carry an inline citation naming the source and tier.

- Key facts & statistical baselines — audited figures, prevalence/incidence/market size, success/failure rates, regulatory thresholds, recall/incident data, cost benchmarks. Pull from Tier 1–3 only.
- Authoritative eligibility / qualification / specification criteria — the precise thresholds, classifications, or technical requirements set by the relevant standards or regulators, cited verbatim where possible.
- Strict exclusions, contraindications, or non-conformities — what disqualifies a candidate / product / application, plus required stabilisation, cure, burn-in, or remediation periods.
- Structural / administrative / regulatory barriers — devolution of authority (e.g. regional commissioners, state regulators, local councils), jurisdictional variance, "postcode/zip-code lottery" effects.
- Post-purchase / post-treatment / lifecycle realities — warranty terms, maintenance funding limits, discharge protocols, end-of-life obligations, total cost of ownership beyond the headline price.
- Macro-economic and contractual barriers — payer/provider economics, contract incentives or disincentives, tariff/charge bands, reimbursement gaps, lab/material/component costs.
- Real-world scenario clashes — case studies, named audits, or documented incidents that show the divergence between public expectation and the strict commissioning / regulatory / engineering boundary.
- Common misconceptions and where they originate — what high-ranking SEO content gets wrong, with the authoritative correction.
- Underexplored angles and competitor content gaps — subtopics absent from the top SERP results that the authoritative sources actually emphasise.
- Recommended H2/H3 outline — search-intent-aligned structure, with the specific Tier 1–3 source each section should draw from.
- VALUE PROMISE DATA AUDIT (MANDATORY FINAL SECTION) — a numbered checklist mapping each value promise to the exact section(s), table(s), and source(s) in this document that contain its complete supporting data. Format: "PROMISE 1: FULFILLED — data in [section name], sources [name, tier]" or "PROMISE 3: UNSOURCED — [exactly what could not be found in Tier 1–4 sources]". Never silently skip a promise. If any promise is UNSOURCED, state it plainly so the editor can revise the promise before the article is written.

3. FORMATTING AND EXECUTION DIRECTIVES

- Zero marketing fluff. No "in today's fast-paced world", no "let's dive in", no patient-friendly simplifications.
- Every statistic must include: figure, date or period, jurisdiction, source name, tier, and direct URL where available.
- Present comparison data, regional cost structures, eligibility matrices, and technical specifications as clean markdown tables.
- Use LaTeX strictly for genuine mathematical / scientific expressions (forces, biochemical metrics, coordinate deviations, financial formulae). Do NOT wrap plain numbers, currencies, or ranges in LaTeX.
- If a claim cannot be sourced to Tier 1–3 (or Tier 4 for product specs), OMIT IT. Do not invent, do not paraphrase from forbidden sources, do not "best-guess".
- End the document with a single consolidated References section: bulleted list, anchor-text title only, grouped by tier, with the direct URL beside each entry. No duplicate citations.

Begin the deep research now.`;
}
