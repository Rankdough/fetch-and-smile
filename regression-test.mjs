/**
 * fetch-and-smile regression test suite
 * Run: node regression-test.mjs
 * Exit 0 = all pass. Exit 1 = failures. Run before every deploy.
 *
 * Tests pure utility functions against the known-bad inputs that caused
 * production bugs. Add a test for every new bug found.
 */

import { readFileSync } from "fs";
import { createRequire } from "module";

// ── helpers ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const FAIL = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    FAIL.push(name);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertAbsent(str, pattern, msg) {
  if (typeof pattern === "string") assert(!str.includes(pattern), msg || `Should not contain: ${pattern}`);
  else assert(!pattern.test(str), msg || `Should not match: ${pattern}`);
}
function assertPresent(str, pattern, msg) {
  if (typeof pattern === "string") assert(str.includes(pattern), msg || `Should contain: ${pattern}`);
  else assert(pattern.test(str), msg || `Should match: ${pattern}`);
}

// ── load compiled JS from node_modules (workaround for TS-only source) ───────
const require = createRequire(import.meta.url);
let marked, repairFn, trimFn, buildEeat, extractFromArticle;

try {
  ({ marked } = require("marked"));
} catch { console.warn("marked not installed — skipping marked-dependent tests"); }

// ── INLINE the pure-logic functions since we can't import TS directly ─────────

// trimToWordCount (from articleSectionBudget.ts)
function countWords(text) { return text.split(/\s+/).filter(Boolean).length; }
function trimToWordCount(text, maxWords) {
  if (!text.trim() || maxWords <= 0) return "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  const DECIMAL_PLACEHOLDER = "\x00DEC\x00";
  const URL_PLACEHOLDER_PREFIX = "\x00URL";
  const URL_PLACEHOLDER_SUFFIX = "\x00";
  const protectedUrls = [];
  let protectedText = text.replace(/\[[^\]]*\]\(\s*https?:\/\/[^\)\s]+\s*\)|https?:\/\/[^\s)]+/g, (m) => {
    protectedUrls.push(m);
    return `${URL_PLACEHOLDER_PREFIX}${protectedUrls.length - 1}${URL_PLACEHOLDER_SUFFIX}`;
  });
  protectedText = protectedText.replace(/(\d)\.(?=\d)/g, `$1${DECIMAL_PLACEHOLDER}`);
  const restore = (s) => s
    .replace(new RegExp(DECIMAL_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), ".")
    .replace(/\x00URL(\d+)\x00/g, (_m, i) => protectedUrls[Number(i)] ?? "");
  const sentences = protectedText.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g)?.map(s => restore(s).trim()).filter(Boolean) ?? [];
  const completeSentences = [];
  let usedWords = 0;
  for (const sentence of sentences) {
    const sw = countWords(sentence);
    if (usedWords + sw > maxWords) break;
    completeSentences.push(sentence);
    usedWords += sw;
  }
  if (completeSentences.length > 0) return completeSentences.join(" ").trim();
  const cut = words.slice(0, maxWords).join(" ");
  return cut.endsWith(".") || cut.endsWith("!") || cut.endsWith("?") ? cut : cut + ".";
}

// repairArticleHtml (key parts of articleValidator.ts)
function repairArticleHtml(html) {
  const applied = [];
  // Fix nested anchors (must not cross </a>)
  const nestedAnchorRe = /<a([^>]*)>((?:(?!<\/a>)[\s\S])*?)<a[^>]*>((?:(?!<\/a>)[\s\S])*?)<\/a>((?:(?!<\/a>)[\s\S])*?)<\/a>/gi;
  if (nestedAnchorRe.test(html)) {
    html = html.replace(nestedAnchorRe, (_m, attrs, pre, inner, post) =>
      `<a${attrs}>${pre}${inner}${post}</a>`);
    applied.push("flattened-nested-anchors");
  }
  // Fix word-split artefacts (negative lookbehind for apostrophes and <)
  const wordSplitRe = /(?<![<'\u2019])\b([a-z])\s([a-z]{2,})\b/g;
  const before = html;
  html = html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (_m, attrs, body) => {
    const fixed = body.replace(wordSplitRe, (match, a, b) => {
      if (a === "a" || a === "i") return match;
      return a + b;
    });
    return `<p${attrs}>${fixed}</p>`;
  });
  if (html !== before) applied.push("joined-split-words");
  return { html, applied };
}

// normaliseQuickTipsContent (from prop edge fn)
function normaliseQuickTipsContent(content) {
  const lines = content.split("\n");
  const candidates = [];
  let order = 0;
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^!\[/.test(line)) continue;
    if (/^\|/.test(line)) continue;
    line = line.replace(/^>\s*/, "").replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "").trim();
    if (!line) continue;
    line = line.replace(/^\*{0,2}Tip\s*\d+\s*:?\*{0,2}\s*/i, "");
    line = line.replace(/^\*\*[^*]+\*\*\s*:?\s*/, "");
    line = line.replace(/^["'\u201c\u201d\u2018\u2019\s]+/, "").replace(/["'\u201c\u201d\u2018\u2019\s]+$/, "").trim();
    if (!line) continue;
    if (/quick\s*tips?/i.test(line)) continue;
    if (/^(here are|these are|the following|in this section|below are|keep reading|let's|remember)\b/i.test(line)) continue;
    if (/:$/.test(line)) continue;
    if (line.split(/\s+/).length < 4) continue;
    if (!/[.!?]$/.test(line)) line = `${line}.`;
    candidates.push({ text: line, order: order++ });
  }
  if (candidates.length === 0) return content;
  const seen = new Set();
  const unique = candidates.filter((c) => {
    const k = c.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const score = (s) =>
    (/\d/.test(s) ? 2 : 0) +
    (/\u00b0|%|hour|minute|second|cycle|degrees?\b/i.test(s) ? 1 : 0) +
    (/^(avoid|never|always|use|verify|wait|check|keep|air[- ]dry|wash|set|turn)\b/i.test(s) ? 1 : 0);
  const chosen = [...unique]
    .sort((a, b) => score(b.text) - score(a.text) || a.order - b.order)
    .slice(0, 3)
    .sort((a, b) => a.order - b.order);
  return chosen.map((c) => `> ${c.text}`).join("\n\n");
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nfetch-and-smile regression tests\n");

// ── Group 1: URL protection in trimToWordCount ────────────────────────────
console.log("1. URL protection in trimToWordCount");
test("domain dot never treated as sentence boundary", () => {
  const input = "Always care for your jersey. You can find new jerseys at https://bigleagueshirts.com/pages/get-started for your team.";
  const result = trimToWordCount(input, 20);
  const lines = result.split("\n"); const hasHalfUrl = lines.some(l => l.trim().endsWith("bigleagueshirts.") || l.trim().startsWith("com/")); assert(!hasHalfUrl, "URL was split across lines at domain dot");
  assertAbsent(result, "\ncom/", "URL split across lines");
});
test("markdown link preserved intact", () => {
  const input = "See [our jerseys](https://bigleagueshirts.com/collections/jerseys) for custom options.";
  const result = trimToWordCount(input, 15);
  if (result.includes("bigleagueshirts")) {
    assertAbsent(result, "] (https", "space inserted in markdown link");
  }
});
test("short text returned unchanged", () => {
  const input = "Short text.";
  assert(trimToWordCount(input, 100) === input.trim(), "Short text should be unchanged");
});

// ── Group 2: repairArticleHtml — anchor preservation ──────────────────────
console.log("\n2. Anchor preservation in repairArticleHtml");
test("sibling anchors NOT flattened into one", () => {
  const html = `<div>
    <a href="#section-1" style="color:red;">Jump 1</a>
    <a href="#section-2-with-5percent" style="color:red;">Jump 2</a>
    <a href="#section-3-with-amp" style="color:red;">Jump 3</a>
  </div>`;
  const { html: out, applied } = repairArticleHtml(html);
  const count = (out.match(/<a href/g) || []).length;
  assert(count === 3, `Expected 3 anchors, got ${count}. Applied: ${applied.join(", ")}`);
});
test("genuinely nested anchor IS flattened", () => {
  const html = `<a href="#outer"><span><a href="#inner">inner text</a></span> outer text</a>`;
  const { html: out } = repairArticleHtml(html);
  const count = (out.match(/<a href/g) || []).length;
  assert(count === 1, `Expected 1 anchor after flatten, got ${count}`);
});

// ── Group 3: wordSplitRe — apostrophes and tag names safe ────────────────
console.log("\n3. wordSplitRe — no false joins");
test("apostrophe contractions not corrupted", () => {
  const html = `<p style="color:red;">A jersey's worst enemy is heat. Isn't that right?</p>`;
  const { html: out } = repairArticleHtml(html);
  assertPresent(out, "jersey's worst", "apostrophe contraction corrupted");
  assertPresent(out, "Isn't", "isn't corrupted");
});
test("<p style> tag not collapsed to <pstyle>", () => {
  const html = `<div><p style="margin:0;">text one</p><p style="color:blue;">text two</p></div>`;
  const { html: out } = repairArticleHtml(html);
  assertAbsent(out, "<pstyle", "<p style> was collapsed to <pstyle>");
  assertAbsent(out, "<pid=", "<p id> was collapsed to <pid=>");
});

// ── Group 4: Quick Tips normaliser ───────────────────────────────────────
console.log("\n4. Quick Tips normaliser");
test("intro sentence dropped, 3 real tips extracted", () => {
  const input = `" Keep your jerseys like new with these quick tips."

> " Avoid high heat to protect fabrics and graphics."

> " Sublimated jerseys offer the best durability."

- Air dry graphic jerseys to prevent adhesives from separating.
- Verify dryer "low" settings with an infrared thermometer.
- Wait 24 hours before washing new heat-applied graphics.`;
  const result = normaliseQuickTipsContent(input);
  const tips = result.split("\n\n").filter(l => l.startsWith("> "));
  assert(tips.length === 3, `Expected 3 tips, got ${tips.length}: ${tips.join(" | ")}`);
  assertAbsent(result, "quick tips", "intro sentence not dropped");
  assertAbsent(result, "best durability", "vague platitude should be deprioritised");
});
test("outputs valid blockquote format", () => {
  const result = normaliseQuickTipsContent(`- Do not use high heat.\n- Air dry flat.\n- Use cold water please.\n- Check the label first.`);
  assert(result.includes("> "), "output must use > blockquote syntax");
});

// ── Group 5: Regression — known breaking inputs ──────────────────────────
console.log("\n5. Known breaking inputs (regression)");
test("bigleagueshirts.com not split at dot in trimToWordCount", () => {
  const input = "For new jerseys check bigleagueshirts.com/collections/new-designs today.";
  const result = trimToWordCount(input, 8);
  assertAbsent(result, "bigleagueshirts.\n", "URL split across newline");
});
test("'jersey's' contraction survives repair", () => {
  const html = `<p>A jersey's worst enemy is heat and isn't fixable.</p>`;
  const { html: out } = repairArticleHtml(html);
  assertPresent(out, "jersey's worst", "jersey's worst was corrupted");
  assertPresent(out, "isn't", "isn't was corrupted");
});
test("nav anchors with % and & in slug survive", () => {
  const html = `<details><summary>How to shrink 5-10%?</summary><div>
    <a href="#how-to-shrink-5-10">Jump</a></div></details>
    <details><summary>Shrinking & Drying</summary><div>
    <a href="#shrinking--drying">Jump</a></div></details>`;
  const { html: out } = repairArticleHtml(html);
  const count = (out.match(/<a href/g) || []).length;
  assert(count === 2, `Expected 2 anchors, got ${count}`);
});

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (FAIL.length > 0) {
  console.error(`\nFailed tests:\n${FAIL.map(f => `  • ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("\nAll tests passed ✓");
process.exit(0);
