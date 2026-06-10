/**
 * fetch-and-smile integration test suite
 * Calls live deployed edge functions and checks HTML output against rules.
 *
 * Usage:
 *   node integration-test.mjs
 *   node integration-test.mjs --topic "NBA and NFL Jersey Stitching"
 *
 * Exit 0 = all pass. Exit 1 = failures.
 * Run before every deploy. Add a test for every new bug found.
 *
 * Cost: 1-2 Gemini API calls per run (~30-60 seconds).
 * Only runs against functions that affect the failing topic.
 */

// ── config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lipkcsgbotjzmzuwsdeu.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpcGtjc2dib3Rqem16dXdzZGV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3ODgwNTAsImV4cCI6MjA4NTM2NDA1MH0.P0SsJkm5pMyoP8QJECYY-bwBrroWa_HIKen-HPh9or4";

const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

// ── test topics ───────────────────────────────────────────────────────────────
// These topics are chosen because they expose specific known failure modes.
// Add a new topic whenever a new failure mode is found in production.
const TEST_TOPICS = [
  {
    name: "jersey-stitching",
    topic: "NBA and NFL Jersey Stitching: What's the Real Difference?",
    keywords: ["nba jersey stitching", "nfl jersey stitching", "authentic jersey"],
    entityBridgeConfig: {
      brandName: "Big League Shirts",
      collectionUrl: "https://bigleagueshirts.com/pages/get-started",
      productLabel: "custom team jerseys",
      sportLabel: "basketball",
    },
    // This topic exposes: decimal splits (0.4%), F.U.S.E. abbreviations,
    // bracketed citation splits, nav ### leaks
  },
  {
    name: "dental-implants",
    topic: "Choosing a Dentist for Implants: Four Questions Most Patients Never Ask",
    keywords: ["dental implants", "implant dentist", "dental specialist"],
    entityBridgeConfig: {
      brandName: "Dental Tourism Albania",
      collectionUrl: "https://dentaltourismalba.com",
      productLabel: "dental implants",
      sportLabel: "",
    },
    // This topic exposes: academic references pipeline, trust box sources
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const FAILURES = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result === "SKIP") {
      console.log(`  ⊘ ${name} (skipped)`);
      skipped++;
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    → ${e.message}`);
    FAILURES.push({ name, reason: e.message });
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertAbsent(html, pattern, msg) {
  if (typeof pattern === "string") {
    assert(!html.includes(pattern), msg || `Found forbidden string: "${pattern}"`);
  } else {
    const m = html.match(pattern);
    assert(!m, msg || `Found forbidden pattern: ${pattern} → "${m?.[0]}"`);
  }
}
function assertPresent(html, pattern, msg) {
  if (typeof pattern === "string") {
    assert(html.includes(pattern), msg || `Missing required string: "${pattern}"`);
  } else {
    assert(pattern.test(html), msg || `Missing required pattern: ${pattern}`);
  }
}
function count(html, pattern) {
  return (html.match(new RegExp(pattern, "g")) || []).length;
}

// ── edge function callers ─────────────────────────────────────────────────────
async function callProprietaryGenerate(body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/proprietary-generate-article`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function callApplyFormat(content, ctaConfig) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/apply-format`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({ content, ctaConfig }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function callInsertInternalLinks(content, links) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/insert-internal-links`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({ content, internalLinks: links }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function generateArticle(config) {
  console.log(`  → Calling proprietary-generate-article for: ${config.topic.slice(0, 60)}...`);
  const start = Date.now();

  const result = await callProprietaryGenerate({
    topic: config.topic,
    length: "medium",
    keywords: config.keywords,
    entityBridgeConfig: config.entityBridgeConfig,
    valuePromiseClaims: config.valueClaims || [],
  });

  const raw = result.content || result.html || result.markdown || "";
  console.log(`  → Generated in ${((Date.now() - start) / 1000).toFixed(1)}s (${raw.length} chars)`);
  return raw;
}

// ── rule checks (run against the final HTML string) ──────────────────────────
function runRuleChecks(html, topicName) {
  console.log(`\n  ── Structure ──`);

  test("direct-answer paragraph present", () => {
    assertPresent(html, 'id="direct-answer"');
  });

  test("trust box present", () => {
    assertPresent(html, 'data-trust-signal="true"');
  });

  test("TL;DR heading present", () => {
    assertPresent(html, 'id="tldr"');
  });

  test("TL;DR is ONE paragraph block (not split into 2+)", () => {
    // Count TL;DR styled p elements — should be exactly 1
    const tldrPs = (html.match(/border-left: 4px solid #E31837.*?padding: 16px 24px/g) || []).length;
    assert(tldrPs === 1, `TL;DR split into ${tldrPs} styled blocks — should be 1`);
  });

  test("In This Article nav present", () => {
    assertPresent(html, "In This Article");
  });

  test("Quick Tips heading present", () => {
    assertPresent(html, 'id="quick-tips"');
  });

  test("FAQ section present with 5 pairs", () => {
    assertPresent(html, "Frequently Asked Questions");
    const faqItems = count(html, "details.*?background: #ffffff.*?border: 1px solid #e5e7eb");
    assert(faqItems >= 5, `FAQ has ${faqItems} items, expected 5`);
  });

  test("FAQ Q4/Q5 not boilerplate", () => {
    assertAbsent(html, "What is the main point of",
      "FAQ Q4 is generic boilerplate — FAQAccordion.tsx fallback fired");
    assertAbsent(html, "How should someone use this information",
      "FAQ Q5 is generic boilerplate — FAQAccordion.tsx fallback fired");
  });

  test("Final Thoughts heading present", () => {
    assertPresent(html, 'id="final-thoughts"');
  });

  test("At least 3 question H2 sections present", () => {
    const sections = count(html, 'itemtype="https://schema.org/Question"');
    assert(sections >= 3, `Only ${sections} question H2 sections found`);
  });

  console.log(`\n  ── Content quality ──`);

  test("No decimal splits (0. 4 pattern)", () => {
    assertAbsent(html, /\d\.\s+\d/,
      "Decimal split found — sentence tokeniser broke a number like '0. 4'");
  });

  test("No F.U.S.E. abbreviation splits", () => {
    assertAbsent(html, /[A-Z]\.\s+[A-Z]\.\s+[A-Z]/,
      "Abbreviation split found — e.g. 'F. U. S. E.' instead of 'F.U.S.E.'");
  });

  test("No raw ### headings in nav previews", () => {
    const navSection = html.match(/In This Article[\s\S]*?<\/div>\s*<\/div>/)?.[0] || "";
    assertAbsent(navSection, "###",
      "Raw ### markdown heading found inside nav section preview");
  });

  test("No 'compiled from' source fragments in body", () => {
    assertAbsent(html, /[Tt]his data was compiled from/,
      "Inline source fragment not stripped — 'This data was compiled from X.docx'");
  });

  test("No 'id=\"direct-answer\"' visible as text", () => {
    assertAbsent(html, /id=.direct-answer.&lt;\/p&gt;/,
      "id=direct-answer escaped HTML visible as text");
    assertAbsent(html, /id="direct-answer"<\/p>/,
      "id=direct-answer appears as text outside attribute");
  });

  test("No orphan opening citation bracket", () => {
    assertAbsent(html, /<p[^>]*>\s*\[/,
      "Paragraph starts with orphan [ bracket");
  });

  test("No word starts with lowercase after sentence split", () => {
    // Check for 'onversely,' pattern — first char stripped from 'Conversely,'
    assertAbsent(html, />\s+onversely/,
      "Leading character stripped from sentence — e.g. 'onversely' instead of 'Conversely'");
  });

  console.log(`\n  ── CTAs ──`);

  test("CTA present", () => {
    assertPresent(html, "bigleagueshirts.com");
  });

  test("CTA has no empty template hole 'with our .'", () => {
    assertAbsent(html, /with our\s*\./i,
      "CTA contains empty productLabel hole: 'with our .'");
  });

  test("CTA has no empty template hole 'for your .'", () => {
    assertAbsent(html, /for your\s*\./i,
      "CTA contains empty productLabel hole: 'for your .'");
  });

  test("No broken emoji replacement character in CTA", () => {
    assertAbsent(html, "\uFFFD",
      "Broken emoji replacement character (�) found — 4-byte emoji sliced mid-codepoint");
  });

  console.log(`\n  ── References ──`);

  test("References section present", () => {
    assertPresent(html, /id="references"|<h2[^>]*>\s*References\s*<\/h2>/i,
      "No References section found — context file URLs not extracted");
  });

  test("References are numbered list not bullets", () => {
    const refsSection = html.match(/References[\s\S]*?(?=<h2|$)/i)?.[0] || "";
    if (!refsSection.includes("href=")) return "SKIP";
    assertAbsent(refsSection, "<ul",
      "References rendered as <ul> bullets instead of <ol> numbered list");
  });

  test("References have real clickable links", () => {
    const refsSection = html.match(/References[\s\S]*?(?=<h2|$)/i)?.[0] || "";
    if (!refsSection) return "SKIP";
    assertPresent(refsSection, 'href="http',
      "References section has no clickable https:// links");
  });

  console.log(`\n  ── Schema / SEO ──`);

  test("Question schema wrapping present", () => {
    assertPresent(html, 'itemtype="https://schema.org/Question"');
  });

  test("acceptedAnswer schema present", () => {
    assertPresent(html, 'itemtype="https://schema.org/Answer"');
  });

  test("itemprop description on direct answer", () => {
    assertPresent(html, 'itemprop="description"');
  });

  test("Author name in trust box", () => {
    assertPresent(html, "Nic Reese");
  });

  test("Author not duplicated outside trust box", () => {
    const authorCount = count(html, "Nic Reese");
    assert(authorCount <= 2,
      `Author name appears ${authorCount} times — should appear at most twice`);
  });

  test("Tables present", () => {
    const tableCount = count(html, "<table");
    assert(tableCount >= 2, `Only ${tableCount} tables found — expected at least 2`);
  });

  test("No empty table rows", () => {
    // A table row where all td cells are empty
    assertAbsent(html, /<tr[^>]*>\s*(<td[^>]*>\s*<\/td>\s*){2,}<\/tr>/,
      "Table contains a row with all empty cells");
  });
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\nfetch-and-smile integration tests");
  console.log("Calling live Supabase edge functions\n");

  // Check which topic to test
  const topicArg = process.argv.find(a => a.startsWith("--topic="))?.split("=")?.[1];
  const topics = topicArg
    ? TEST_TOPICS.filter(t => t.name === topicArg || t.topic.includes(topicArg))
    : TEST_TOPICS.slice(0, 1); // default: only jersey topic (faster)

  for (const config of topics) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`Topic: ${config.name}`);
    console.log(`${"─".repeat(60)}`);

    let html;
    try {
      const markdown = await generateArticle(config);

      // Run through apply-format
      console.log("  → Calling apply-format...");
      const formatted = await callApplyFormat(markdown, {
        headline: `Custom ${config.entityBridgeConfig.sportLabel || "Team"} Jerseys`,
        description: `Experience professional-grade ${config.entityBridgeConfig.productLabel}`,
        buttonText: "Get Started",
        buttonUrl: config.entityBridgeConfig.collectionUrl,
      });
      html = formatted.content || formatted.html || markdown;

    } catch (err) {
      console.error(`\n  FATAL: Article generation failed — ${err.message}`);
      console.error("  Cannot run rule checks without generated HTML.");
      FAILURES.push({ name: `${config.name}: generation`, reason: err.message });
      failed++;
      continue;
    }

    // Run all rule checks
    runRuleChecks(html, config.name);
  }

  // ── summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (FAILURES.length > 0) {
    console.error(`\nFailed checks:`);
    FAILURES.forEach(f => console.error(`  ✗ ${f.name}\n    ${f.reason}`));
    console.error("\nDeploy blocked. Fix the above before deploying.");
    process.exit(1);
  }

  console.log("\nAll checks passed ✓ — safe to deploy.");
  process.exit(0);
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
