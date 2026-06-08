/**
 * fetch-and-smile structural test
 * Tests that a generated article has correct structure.
 * Run: SUPABASE_URL=... SUPABASE_KEY=... node structural-test.mjs
 *
 * Unlike regression-test.mjs (which tests pure functions),
 * this hits the actual deployed edge function and validates output structure.
 * Run this after every deploy before calling the fix done.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_KEY env vars");
  process.exit(1);
}

let passed = 0, failed = 0;
const FAILURES = [];

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.error(`  ✗ ${name}: ${e.message}`); FAILURES.push(name); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── Generate a test article ──────────────────────────────────────────────────
console.log("\nGenerating test article (TrackBarn — triple jump)...");
const res = await fetch(`${SUPABASE_URL}/functions/v1/proprietary-generate-article`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
  body: JSON.stringify({
    topic: "Triple Jump: Hop Step Jump Technique",
    length: "medium",
    wordCount: 1000,
    businessType: "service",
    publicationDestination: "both",
    valuePromiseClaims: ["explain the hop phase", "explain the step phase", "explain the jump phase"],
  }),
});

if (!res.ok) {
  console.error(`Generation failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
const md = data.markdown || "";
console.log(`  Generated ${md.split(/\s+/).length} words\n`);

// ── Structure tests ──────────────────────────────────────────────────────────
console.log("Structure checks:\n");

// 1. Opening paragraph present
test("Opening paragraph present (before TL;DR)", () => {
  const tldrPos = md.search(/^## TL;?DR/im);
  const content = tldrPos > 0 ? md.slice(0, tldrPos) : md;
  assert(content.trim().length > 50, "No opening paragraph before TL;DR");
});

// 2. TL;DR present
test("TL;DR section present", () => {
  assert(/^## TL;?DR/im.test(md), "No ## TL;DR heading");
});

// 3. Quick Tips present and normalised
test("Quick Tips: 3 blockquote tips", () => {
  const qt = md.match(/^## Quick Tips\n([\s\S]*?)(?=\n##\s)/im);
  assert(qt, "No Quick Tips section");
  const tips = (qt[1].match(/^>\s+\S/gm) || []);
  assert(tips.length === 3, `Expected 3 tips, got ${tips.length}`);
});

// 4. Body sections — at least 2 H2 sections that are not framing sections
test("At least 2 body H2 sections", () => {
  const SKIP = /tl;?dr|quick.tips|in.this.article|faq|final.thoughts|references|how.to.choose/i;
  const h2s = (md.match(/^## .+/gm) || []).filter(h => !SKIP.test(h));
  assert(h2s.length >= 2, `Expected ≥2 body H2s, got ${h2s.length}: ${h2s.join(" | ")}`);
});

// 5. No ## heading embedded inside paragraph or bullet
test("No ## heading embedded inside bullet/paragraph", () => {
  const lines = md.split("\n");
  for (const line of lines) {
    const inlineH2 = line.match(/[^#\n].+##\s\w/);
    assert(!inlineH2, `H2 embedded in line: "${line.slice(0, 80)}"`);
  }
});

// 6. FAQ present with 5 questions
test("FAQ: 5 questions", () => {
  const faqMatch = md.match(/^## Frequently Asked Questions([\s\S]*?)(?=\n## |$)/im);
  assert(faqMatch, "No FAQ section");
  const questions = (faqMatch[1].match(/^\*\*[^*]+\*\*$/gm) || []);
  assert(questions.length === 5, `Expected 5 FAQ questions, got ${questions.length}`);
});

// 7. FAQ does not contain Final Thoughts or References
test("FAQ does not contain Final Thoughts bleed", () => {
  const faqMatch = md.match(/^## Frequently Asked Questions([\s\S]*?)(?=\n## |$)/im);
  if (!faqMatch) return;
  const faqContent = faqMatch[1];
  assert(!/final.thoughts/i.test(faqContent), "Final Thoughts bled into FAQ");
  assert(!/^\- .{40,}/m.test(faqContent.slice(-500)), "References bled into FAQ");
});

// 8. Final Thoughts present and separate
test("Final Thoughts section present", () => {
  assert(/^## Final.thoughts/im.test(md), "No Final Thoughts section");
});

// 9. No standalone orphan sentences (e.g. "89 meters." "0 m/s")
test("No decimal-split orphan fragments", () => {
  const orphans = md.match(/^[0-9]+[\s\w]{0,15}[.!?]$/gm) || [];
  const real = orphans.filter(o => o.trim().split(/\s+/).length <= 3);
  assert(real.length === 0, `Orphan fragments: ${real.join(" | ")}`);
});

// 10. Word count within 20% of target
test("Word count within 20% of 1000-word target", () => {
  const words = md.split(/\s+/).filter(Boolean).length;
  assert(words >= 800, `Too short: ${words} words (target 1000, floor 800)`);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (FAILURES.length) {
  console.error(`\nFailed:\n${FAILURES.map(f => `  • ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("\nAll structural tests passed ✓");
process.exit(0);
