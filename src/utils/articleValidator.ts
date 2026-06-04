/**
 * Article Validator + Auto-Repair
 *
 * Deterministic post-generation gate. Runs over the FINAL HTML right before export.
 *
 * Two passes:
 *  1. repairArticleHtml(html)   — fixes mechanical defects (markdown leftovers,
 *                                 nested anchors, <p> inside headings, paragraph
 *                                 density violations, word-splitting artefacts).
 *  2. validateArticleHtml(html) — runs hard structural checks and returns a
 *                                 report. The UI surfaces every result; export is
 *                                 blocked (or requires explicit override) when
 *                                 any HARD check fails.
 *
 * Pure functions, no DOM dependency required (uses regex + a lightweight tag
 * stripper so it can run in tests and in the browser).
 */

export type CheckSeverity = "hard" | "warn";
export type CheckStatus = "pass" | "fail";

export interface CheckResult {
  id: string;
  label: string;
  severity: CheckSeverity;
  status: CheckStatus;
  detail?: string;
}

export interface ValidatorOptions {
  /** Target word count for the article body (excluding boilerplate). */
  targetWordCount?: number;
  /** Allowed deviation from target as a fraction (default 0.15 = ±15%). */
  wordCountTolerance?: number;
  /** Whether FAQ section is expected. */
  requireFAQ?: boolean;
  /** Whether References section is expected. */
  requireReferences?: boolean;
  /** Whether Quick Tips are expected (exactly 3). */
  requireQuickTips?: boolean;
  /** Whether at least 1 expert quote is expected. */
  requireExpertQuote?: boolean;
  /** Whether at least 2 CTA banners are expected. */
  requireCTAs?: boolean;
}

export interface ValidationReport {
  checks: CheckResult[];
  hardFailures: CheckResult[];
  warnings: CheckResult[];
  passed: boolean;
  stats: {
    wordCount: number;
    tables: number;
    h2: number;
    ctas: number;
    quickTips: number;
    quotes: number;
    paragraphsOverLimit: number;
  };
}

export interface RepairResult {
  html: string;
  applied: string[];
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const stripTags = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const countWords = (text: string): number =>
  text ? text.split(/\s+/).filter(Boolean).length : 0;

const countSentences = (text: string): number =>
  (text.match(/[.!?]+(?=\s|$)/g) || []).length || 1;

/** Remove the boilerplate sections from HTML so word count reflects body prose. */
const stripBoilerplate = (html: string): string => {
  let out = html;
  // Drop CTA banners
  out = out.replace(
    /<div[^>]*data-cta-banner="true"[\s\S]*?<\/div>\s*<\/div>?/gi,
    " ",
  );
  out = out.replace(/<div[^>]*data-cta-banner="true"[\s\S]*?<\/div>/gi, " ");
  // Drop FAQ JSON-LD
  out = out.replace(
    /<script[^>]*application\/ld\+json[\s\S]*?<\/script>/gi,
    " ",
  );
  // Drop References list (heading + following block until next h2 or end)
  out = out.replace(
    /<h2[^>]*>[\s\S]*?References[\s\S]*?<\/h2>[\s\S]*?(?=<h2|$)/gi,
    " ",
  );
  // Drop FAQ section
  out = out.replace(
    /<h2[^>]*>[\s\S]*?(?:FAQ|Frequently Asked Questions)[\s\S]*?<\/h2>[\s\S]*?(?=<h2|$)/gi,
    " ",
  );
  return out;
};

// ---------------------------------------------------------------------------
// Repair pass
// ---------------------------------------------------------------------------

export function repairArticleHtml(input: string): RepairResult {
  let html = input;
  const applied: string[] = [];

  // 1. Convert leftover markdown links [text](url) → <a href="url">text</a>
  const mdLinkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  if (mdLinkRe.test(html)) {
    html = html.replace(mdLinkRe, (_m, text, url) => `<a href="${url}">${text}</a>`);
    applied.push("converted-markdown-links");
  }

  // 2. Strip nested anchors:  <a ...><a ...>text</a></a>  →  outer kept
  const nestedAnchorRe = /<a([^>]*)>([\s\S]*?)<a[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/a>/gi;
  if (nestedAnchorRe.test(html)) {
    html = html.replace(nestedAnchorRe, (_m, attrs, pre, inner, post) =>
      `<a${attrs}>${pre}${inner}${post}</a>`,
    );
    applied.push("flattened-nested-anchors");
  }

  // 3. Unwrap <p> wrappers inside headings: <h2><p>X</p></h2> → <h2>X</h2>
  const pInHeadingRe = /<(h[1-6])([^>]*)>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/\1>/gi;
  if (pInHeadingRe.test(html)) {
    html = html.replace(pInHeadingRe, (_m, tag, attrs, inner) => `<${tag}${attrs}>${inner}</${tag}>`);
    applied.push("unwrapped-p-in-headings");
  }

  // 4. Fix word-splitting artefacts: single letter + space + lowercase letters at
  //    start of a word inside paragraphs. Conservative: only join when the first
  //    "word" is exactly 1 char and lowercase, surrounded by letters.
  //    e.g. "h ome" → "home", "t he" → "the".
  const wordSplitRe = /\b([a-z])\s([a-z]{2,})\b/g;
  // Only apply inside <p>...</p> to avoid breaking attributes.
  const before = html;
  html = html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (_m, attrs, body) => {
    const fixed = body.replace(wordSplitRe, (match: string, a: string, b: string) => {
      // Skip common legitimate single-letter words: a, i
      if (a === "a" || a === "i") return match;
      return a + b;
    });
    return `<p${attrs}>${fixed}</p>`;
  });
  if (html !== before) applied.push("joined-split-words");

  // 5. Truncated/unbalanced blockquotes — close any <blockquote> missing a closer
  //    before the next <h2 or end-of-doc.
  const bqOpens = (html.match(/<blockquote\b/gi) || []).length;
  const bqCloses = (html.match(/<\/blockquote>/gi) || []).length;
  if (bqOpens > bqCloses) {
    // Append missing closers at end of document as a last resort
    html = html + "</blockquote>".repeat(bqOpens - bqCloses);
    applied.push("closed-unbalanced-blockquotes");
  }

  // 6. Paragraph density — split paragraphs >60 words OR >3 sentences at sentence
  //    boundaries. Preserve the original <p ...> attributes on every shard.
  let densitySplit = 0;
  html = html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs: string, body: string) => {
    const plain = stripTags(body);
    const words = countWords(plain);
    const sentences = countSentences(plain);
    if (words <= 60 && sentences <= 3) return match;

    // Only split if body has no block-level children we shouldn't fragment
    if (/<(ul|ol|table|blockquote|figure|img|div)/i.test(body)) return match;

    // Split on sentence boundaries
    const parts = body.split(/(?<=[.!?])\s+(?=[A-Z"])/);
    if (parts.length < 2) return match;

    // Group into chunks of ≤3 sentences / ≤60 words
    const chunks: string[] = [];
    let cur: string[] = [];
    let curWords = 0;
    for (const p of parts) {
      const w = countWords(stripTags(p));
      if (cur.length === 0) {
        cur.push(p);
        curWords = w;
        continue;
      }
      if (cur.length < 3 && curWords + w <= 60) {
        cur.push(p);
        curWords += w;
      } else {
        chunks.push(cur.join(" "));
        cur = [p];
        curWords = w;
      }
    }
    if (cur.length) chunks.push(cur.join(" "));
    if (chunks.length < 2) return match;
    densitySplit++;
    return chunks.map((c) => `<p${attrs}>${c.trim()}</p>`).join("\n");
  });
  if (densitySplit > 0) applied.push(`split-${densitySplit}-dense-paragraphs`);

  return { html, applied };
}

// ---------------------------------------------------------------------------
// Validation pass
// ---------------------------------------------------------------------------

export function validateArticleHtml(
  html: string,
  options: ValidatorOptions = {},
): ValidationReport {
  const {
    targetWordCount,
    wordCountTolerance = 0.15,
    requireFAQ = true,
    requireReferences = true,
    requireQuickTips = true,
    requireExpertQuote = true,
    requireCTAs = true,
  } = options;

  const checks: CheckResult[] = [];

  // ----- stats
  const bodyOnly = stripBoilerplate(html);
  const bodyText = stripTags(bodyOnly);
  const wordCount = countWords(bodyText);

  const tableCount = (html.match(/<table\b/gi) || []).length;
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  const h2Count = h2Matches.length;

  const ctaCount = (html.match(/data-cta-banner="true"/g) || []).length;
  const quoteCount = (html.match(/<blockquote\b/gi) || []).length;
  // Quick Tips = blockquotes containing "Tip N"
  const quickTipCount = (
    html.match(/<blockquote[^>]*>[\s\S]*?Tip\s*\d[\s\S]*?<\/blockquote>/gi) || []
  ).length;

  // Paragraph density audit
  const pBlocks = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  let paragraphsOverLimit = 0;
  for (const m of pBlocks) {
    const text = stripTags(m[1]);
    if (countWords(text) > 60 || countSentences(text) > 3) paragraphsOverLimit++;
  }

  // ----- structural checks
  const add = (c: CheckResult) => checks.push(c);

  add({
    id: "h1",
    label: "Exactly one H1",
    severity: "hard",
    status: h1Count === 1 ? "pass" : "fail",
    detail: `found ${h1Count}`,
  });

  add({
    id: "tldr",
    label: "TL;DR section present",
    severity: "hard",
    status: /<h2[^>]*>[\s\S]*?TL;?DR[\s\S]*?<\/h2>/i.test(html) ? "pass" : "fail",
  });

  if (requireQuickTips) {
    add({
      id: "quick-tips",
      label: "Exactly 3 Quick Tips",
      severity: "hard",
      status: quickTipCount === 3 ? "pass" : "fail",
      detail: `found ${quickTipCount}`,
    });
  }

  add({
    id: "h2-count",
    label: "At least 3 H2 sections",
    severity: "hard",
    status: h2Count >= 3 ? "pass" : "fail",
    detail: `found ${h2Count}`,
  });

  if (requireFAQ) {
    add({
      id: "faq",
      label: "FAQ section present",
      severity: "hard",
      status: /<h2[^>]*>[\s\S]*?(?:FAQ|Frequently Asked Questions)[\s\S]*?<\/h2>/i.test(html)
        ? "pass"
        : "fail",
    });
  }

  if (requireReferences) {
    add({
      id: "references",
      label: "References section present",
      severity: "hard",
      status: /<h2[^>]*>[\s\S]*?References[\s\S]*?<\/h2>/i.test(html) ? "pass" : "fail",
    });
  }

  if (requireCTAs) {
    add({
      id: "ctas",
      label: "At least 2 CTA banners",
      severity: "hard",
      status: ctaCount >= 2 ? "pass" : "fail",
      detail: `found ${ctaCount}`,
    });
  }

  if (requireExpertQuote) {
    // Expert quote = blockquote that is NOT a Quick Tip
    const expertQuotes = quoteCount - quickTipCount;
    add({
      id: "expert-quote",
      label: "At least 1 expert quote",
      severity: "warn",
      status: expertQuotes >= 1 ? "pass" : "fail",
      detail: `found ${expertQuotes}`,
    });
  }

  // Tables: 1 per 600 words of target (or actual if no target).
  const tableTarget = Math.max(1, Math.round((targetWordCount || wordCount) / 600));
  add({
    id: "tables",
    label: `≥${tableTarget} tables (1 per 600 words)`,
    severity: "hard",
    status: tableCount >= tableTarget ? "pass" : "fail",
    detail: `found ${tableCount}`,
  });

  // Direct ~30-word answer under each H2 question
  // Question H2 = ends with "?" OR starts with what/why/how/can/is/are/should/do/does/will/which
  const questionH2s = h2Matches.filter((m) => {
    const text = stripTags(m[1]);
    return /\?$/.test(text.trim()) || /^(what|why|how|can|is|are|should|do|does|will|which|when|where|who)\b/i.test(text.trim());
  });
  let missingDirectAnswers = 0;
  for (const m of questionH2s) {
    const idx = (m.index || 0) + m[0].length;
    const after = html.slice(idx, idx + 2000);
    const firstP = after.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!firstP) {
      missingDirectAnswers++;
      continue;
    }
    const words = countWords(stripTags(firstP[1]));
    if (words < 20 || words > 60) missingDirectAnswers++;
  }
  if (questionH2s.length > 0) {
    add({
      id: "direct-answers",
      label: "Direct ~30-word answer under every question H2",
      severity: "hard",
      status: missingDirectAnswers === 0 ? "pass" : "fail",
      detail: `${missingDirectAnswers}/${questionH2s.length} missing`,
    });
  }

  // Paragraph density
  add({
    id: "paragraph-density",
    label: "Every paragraph ≤60 words AND ≤3 sentences",
    severity: "hard",
    status: paragraphsOverLimit === 0 ? "pass" : "fail",
    detail: paragraphsOverLimit > 0 ? `${paragraphsOverLimit} over limit` : undefined,
  });

  // HTML hygiene
  const leftoverMd = /\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(html);
  add({
    id: "no-markdown-leftovers",
    label: "No markdown link leftovers",
    severity: "hard",
    status: leftoverMd ? "fail" : "pass",
  });

  const pInHeading = /<h[1-6][^>]*>\s*<p[^>]*>/i.test(html);
  add({
    id: "no-p-in-heading",
    label: "No <p> inside headings",
    severity: "hard",
    status: pInHeading ? "fail" : "pass",
  });

  const bqOpens = (html.match(/<blockquote\b/gi) || []).length;
  const bqCloses = (html.match(/<\/blockquote>/gi) || []).length;
  add({
    id: "balanced-blockquotes",
    label: "Balanced blockquote tags",
    severity: "hard",
    status: bqOpens === bqCloses ? "pass" : "fail",
    detail: bqOpens !== bqCloses ? `${bqOpens} open / ${bqCloses} close` : undefined,
  });

  // Word count
  if (targetWordCount && targetWordCount > 0) {
    const min = Math.round(targetWordCount * (1 - wordCountTolerance));
    const max = Math.round(targetWordCount * (1 + wordCountTolerance));
    const within = wordCount >= min && wordCount <= max;
    add({
      id: "word-count",
      label: `Word count within ±${Math.round(wordCountTolerance * 100)}% of ${targetWordCount}`,
      severity: "hard",
      status: within ? "pass" : "fail",
      detail: `actual ${wordCount} (range ${min}–${max})`,
    });
  }

  const hardFailures = checks.filter((c) => c.severity === "hard" && c.status === "fail");
  const warnings = checks.filter((c) => c.severity === "warn" && c.status === "fail");

  return {
    checks,
    hardFailures,
    warnings,
    passed: hardFailures.length === 0,
    stats: {
      wordCount,
      tables: tableCount,
      h2: h2Count,
      ctas: ctaCount,
      quickTips: quickTipCount,
      quotes: quoteCount,
      paragraphsOverLimit,
    },
  };
}

/** Convenience: repair then validate. */
export function repairAndValidate(
  html: string,
  options: ValidatorOptions = {},
): { html: string; repair: RepairResult; report: ValidationReport } {
  const repair = repairArticleHtml(html);
  const report = validateArticleHtml(repair.html, options);
  return { html: repair.html, repair, report };
}
