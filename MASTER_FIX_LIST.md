# fetch-and-smile — MASTER FIX LIST
# THE BIBLE. Every fix needed. Based on:
# - 3 days of live debugging (Jersey Stitching + Dental Implants articles)
# - Codex full codebase audit
# - HTML output analysis (16 fixed, 8 remaining after B2)
# - apply-format prompt audit
# - All 54 rules verified against actual article output
# Last updated: 2026-06-09
# Committed at: [this commit]

---

## HOW TO USE
- One fix per commit. Read CLAUDE.md + this file + last 5 commits before starting.
- Run: node integration-test.mjs before every deploy.
- Mark DONE only after: boot log confirmed + article generated + rule checked.
- Update deployed markers in CLAUDE.md after every deploy.

---

## CURRENT SCORE: 16/28 integration rules passing
## TARGET: 28/28

---

# TIER 1 — BREAKING BUGS
# These cause visible failures in every generated article.
# Fix in order. FIX-01 through FIX-05.

### FIX-01 | F.U.S.E. abbreviation protection — BEFORE sentence splitter
- Status: OPEN
- Priority: HIGHEST — causes 3 other failures
- File: proprietary-generate-article/index.ts
- Problem: "Nike Vapor F.U.S.E." splits into "F. U. S." / "E." across separate
  sentences. Cascades into: TL;DR fragments (FIX-03), FAQ Q3 truncated,
  body sentence breaks mid-thought.
- Root cause: B2 collapse regex runs in TL;DR MERGE step — AFTER sentence
  splitter already ran. Must protect BEFORE splitting.
- Fix: In the sentence tokeniser, before any split():
    text = text.replace(/\b([A-Z])\.([A-Z])\.([A-Z])\.([A-Z])\./g, 'ABBR4_$1$2$3$4')
    text = text.replace(/\b([A-Z])\.([A-Z])\.([A-Z])\./g, 'ABBR3_$1$2$3')
    text = text.replace(/\b([A-Z])\.([A-Z])\./g, 'ABBR2_$1$2')
  Then restore after splitting:
    text = text.replace(/ABBR4_([A-Z])([A-Z])([A-Z])([A-Z])/g, '$1.$2.$3.$4.')
    etc.
- Risk: Low — same pattern as decimal protection already in place.
- Test: Article with "F.U.S.E." must show intact in TL;DR, body, and FAQ.

### FIX-02 | CTA broken emoji — replacement character \uFFFD in headline
- Status: OPEN
- File: apply-format/index.ts
- Problem: CTA headline shows "🔥 CUSTOMIZE..." as "⚫ CUSTOMIZE..." — the
  replacement character \uFFFD. Affects every article that has a CTA.
- Root cause: CTA headline string is sliced at a byte boundary that splits a
  4-byte emoji codepoint.
- Fix: Strip emojis entirely from CTA headlines in post-process:
    ctaHeadline = [...ctaHeadline].filter(c => c.codePointAt(0) < 0x1F300).join('')
  OR: replace unicode emoji range:
    ctaHeadline = ctaHeadline.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim()
- Risk: Low — scoped to CTA headline string.
- Test: No \uFFFD in any CTA block.

### FIX-03 | TL;DR renders as 2-5 boxes instead of one visual block
- Status: PARTIALLY FIXED (B2 collapses content but F.U.S.E. re-splits it)
- File: proprietary-generate-article/index.ts + Index.tsx
- Problem: TL;DR shows multiple separate styled <p> blocks. Each paragraph
  gets independent border-radius styling, creating a broken visual.
- Root cause (primary): FIX-01 — F.U.S.E. splits cause multiple paragraphs.
- Root cause (secondary): markdownToStyledHtml in Index.tsx styles each <p>
  independently. No wrapper div around the TL;DR H2 + all its content.
- Fix part A: Resolve FIX-01 first (eliminates the split).
- Fix part B: In markdownToStyledHtml, detect TL;DR block and wrap H2 + all
  following P elements (until next H2) in a single container div with unified
  border styling. H2 gets top-right radius only, last P gets bottom-right only,
  middle Ps get no radius.
- Risk: Medium — HTML renderer change in Index.tsx affects visual layout.
- Test: TL;DR must appear as ONE contiguous visual block regardless of
  paragraph count.

### FIX-04 | How to Choose section — absent from every article
- Status: OPEN
- File: proprietary-generate-article/index.ts
- Function: injectHowToChoose + topicNoun()
- Problem: "How to Choose" H2 section never appears in output. The In This
  Article nav shows 4 sections instead of 5.
- Root cause: topicNoun() returns generic "Option" for any topic it cannot
  classify, producing "How to Choose the Right Option" — model then generates
  generic boilerplate criteria that fail the quality guard and get stripped.
- Fix: When topicNoun() returns "Option", fall back to first meaningful noun
  phrase from the topic string:
    const fallbackNoun = topic
      .replace(/[:\|–—].*/g, '')        // strip subtitle
      .replace(/^(how|what|why|when|which|best|top)\s+/gi, '')  // strip question starters
      .trim()
      .split(/\s+/).slice(0, 3).join(' ')  // take first 3 words
  e.g. "NBA and NFL Jersey Stitching: What's the Real Difference?"
    → topicNoun returns "Option"
    → fallback: "NBA and NFL Jersey Stitching" → use "Jersey Stitching"
- Risk: Low — contained to topicNoun fallback path.
- Test: Article must have "How to Choose" H2 with topic-specific content.
  In This Article nav must show 5 sections.

### FIX-05 | FAQ Q4 and Q5 — generic boilerplate filler
- Status: OPEN
- File: src/pages/Index.tsx (or src/components/FAQAccordion.tsx)
- Function: buildFallbackFaqItems
- Problem: FAQ Q4 = "What is the main point of [article title]?"
  FAQ Q5 = "How should someone use this information about [article title]?"
  These are obvious template filler. Look unprofessional, hurt E-E-A-T.
- Root cause: FAQAccordion.tsx has its own fallback that fires when the
  edge function returns fewer than 5 pairs or the frontend cannot parse them.
  The fallback uses a generic "main point / how to use" template.
- Fix: Replace buildFallbackFaqItems with a version that derives Q4/Q5 from
  the article H2 headings — ask "What is [H2-4]?" and "When should I [H2-5]?"
  Null-safe: if fewer than 2 H2 headings available, keep existing template
  rather than crashing.
  CRITICAL: wrap in try/catch — a frontend crash removes all 5 FAQ pairs AND
  the schema markup simultaneously.
- Risk: HIGH — frontend component crash removes all FAQ + schema.
- Test: All 5 FAQ pairs must be topic-specific. Q4/Q5 must differ from Q1-Q3.
  FAQ accordion expand/collapse must still work. schema.org markup present.

---

# TIER 2 — QUALITY BUGS
# Article is structurally intact but content quality is low.

### FIX-06 | Quick Tips — generic reformulations, not real actionable tips
- Status: OPEN
- File: proprietary-generate-article/index.ts
- Function: buildFallbackQuickTips
- Problem: Tips say "Understand NBA and NFL jersey stitches differ before
  committing to a plan" — restating the topic, not giving advice.
- Root cause: buildFallbackQuickTips generates tips from H2 question headings
  using template "Understand [question] before committing." Always generic.
- Fix: Generate action-oriented tips from topic + value promises instead:
  Template: "Always [verb] [specific detail] to [measurable outcome]."
  Pull verbs and specifics from valuePromiseClaims if available.
  Minimum: tip must contain a number, measurement, or named product/technique.
- Risk: Low — only fires when model Quick Tips fail the count check.
- Test: No tip starts with "Understand" or ends with "before committing."

### FIX-07 | CTA minimum not enforced — sometimes only 1 CTA in article
- Status: OPEN
- File: apply-format/index.ts
- Problem: Articles sometimes have 1 CTA when 2 are required.
- Root cause: apply-format enforces max 2 but has no minimum check.
  When model generates 1 CTA, apply-format accepts it silently.
- Fix: After processing, count CTAs. If count < 2, inject second CTA
  before Final Thoughts using the deterministic blockquote template.
  Guard: null-check ctaConfig.url before injecting.
  Guard: injected CTA must not land inside References section.
- Risk: Medium — placement logic must be tested carefully.
- Test: Every article must have exactly 2 CTA blocks.

### FIX-08 | CTA copy — "Premium Stitching · Unlimited Designs" is generic
- Status: OPEN
- File: apply-format/index.ts
- Problem: CTA tagline defaults to generic benefits not derived from article.
- Root cause: Model falls back to generic benefit language when the topic
  is not clearly sports/product-specific in the custom instructions.
- Fix: Strengthen prompt post-validation — check if CTA tagline contains
  at least one word that also appears in the article topic or H2 headings.
  If not, trigger regeneration with stricter instruction.
  Add explicit negative example for jersey topics in the prompt.
- Risk: Low — prompt change only, no structural change.
- Test: CTA tagline must contain at least one topic-specific word.

### FIX-09 | Author byline — topic not title-cased in specialist label
- Status: OPEN
- File: src/pages/Index.tsx (trust box injection)
- Problem: Byline shows "Nic Reese · Nba and nfl jersey stitching Specialist"
  — first letter of each word not capitalised.
- Root cause: Topic string injected raw without title-case conversion.
- Fix: Apply title-case before injecting:
    topic.replace(/\b\w/g, c => c.toUpperCase())
  Exception: preserve all-caps abbreviations (NBA, NFL, USA).
- Risk: Very low — single string transform.
- Test: Byline must read "Nic Reese · NBA and NFL Jersey Stitching Specialist"

### FIX-10 | Inline source fragments — "compiled from" still appears in body
- Status: PARTIALLY FIXED (B1 added "compiled from X.docx" pattern)
- File: proprietary-generate-article/index.ts
- Function: stripInlineSourceFragments
- Problem: "This data was compiled from Jersey Stitching Research Analysis"
  appears without .docx extension — not caught by current regex.
- Fix: Broaden regex to match "compiled from [anything]" regardless of
  file extension:
    /[.,]?\s*[Tt]his\s+data\s+was\s+compiled\s+from\s+[^.]+[.]/g
  Add second pattern for "data compiled from":
    /[.,]?\s*[Dd]ata\s+(?:was\s+)?compiled\s+from\s+[^.]+[.]/g
- Risk: Low — scoped regex on body text only.
- Test: No "compiled from" text anywhere in article body.

### FIX-11 | Source grounding at 0% — transcript text not treated as context
- Status: OPEN
- File: proprietary-generate-article/index.ts + Index.tsx
- Problem: When research content is injected via transcript field instead of
  docx upload, source grounding validator shows 0%. Article is 100% model-
  invented despite having source material available.
- Root cause: Transcript text is tagged differently from context file content.
  The grounding validator only checks against context file content, not
  transcript content.
- Fix: Ensure transcript text is treated with equal weight as context file
  content in the grounding check. Tag transcript chunks with a TRANSCRIPT:
  prefix and include in the grounding score calculation.
- Risk: Medium — affects grounding validator logic.
- Test: Grounding score > 0% when transcript content is provided.

### FIX-12 | Internal links not inserted when no URLs provided
- Status: OPEN (by design but needs better UX)
- File: supabase/functions/insert-internal-links/index.ts
- Problem: insert-internal-links silently skips if internalLinks array empty.
  No warning shown to user. Article goes out with no internal links.
- Root cause: By design — but there is no UI warning and no nudge to add URLs.
- Fix: When internalLinks is empty or missing, return a warning flag in the
  response. Index.tsx should show a dismissible toast: "No internal links
  added — add URLs in Blog Post Settings → Internal Links."
- Risk: Low — UI warning only, no logic change to link insertion.
- Test: Toast appears when no internal links configured.

### FIX-13 | Broken links not checked before export
- Status: OPEN
- File: src/pages/Index.tsx
- Problem: The fix-broken-links edge function exists and is callable but is
  NOT run automatically before export. User can export articles with broken
  reference links.
- Fix: Add automatic broken-link check as part of the export validation gate.
  If broken links found, show count in export warning (not a hard block —
  user can still export but must acknowledge).
- Risk: Low — adding a check before an existing action.
- Test: Export warning shows broken link count when links return 404.

### FIX-14 | Expert quote — stripped silently with no fallback
- Status: OPEN
- File: proprietary-generate-article/index.ts
- Problem: When model generates a weak/unattributed expert quote, it gets
  stripped by the placeholder guard. No fallback generates a replacement.
  Result: section has no expert voice at all.
- Fix: When expertPlaceholders.removed > 0, trigger a micro-call to
  regenerate a replacement quote using the context file as source.
  If context file is empty, inject a structured "industry consensus" note
  rather than leaving a gap.
- Risk: Medium — adds another model call per missing expert quote.
- Test: No expert quote placeholders visible in final output.

---

# TIER 3 — STRUCTURAL / RENDERING BUGS
# These affect how the article renders in the frontend, not the content.

### FIX-15 | acceptedAnswer schema wrapper — trailing sentences excluded
- Status: OPEN
- File: src/pages/Index.tsx
- Problem: The direct answer paragraph is wrapped in acceptedAnswer schema,
  but if the answer continues across multiple <p> elements, only the first
  is wrapped. Trailing sentences fall outside the schema div.
- Root cause: The schema wrapper closes after the first <p> following the H2.
- Fix: Keep all <p> elements inside acceptedAnswer until the next H2 or H3.
- Risk: Medium — schema DOM structure change.
- Test: schema.org/Answer div must contain all paragraphs up to next heading.

### FIX-16 | Orphan citation brackets — "[" at start of paragraph
- Status: OPEN
- File: proprietary-generate-article/index.ts
- Problem: Some paragraphs start with a bare "[" — orphaned opening bracket
  from a citation that was split by the sentence tokeniser.
- Root cause: The splitter cuts "...fact.[1] Conversely" into separate
  sentences, leaving "[1]" as the start of a new paragraph.
- Fix: Post-stitch: strip paragraphs that start with /^\s*\[/ and merge
  the bracket content with the preceding paragraph.
- Risk: Low — post-stitch cleanup only.
- Test: No paragraph starts with "[".

### FIX-17 | Empty H3 — heading with no body paragraph
- Status: OPEN (intermittent)
- File: proprietary-generate-article/index.ts
- Problem: H3 heading appears with no content beneath it.
- Root cause: The paragraph density splitter cuts the only sentence after
  an H3 into a new paragraph that then fails minimum length checks and
  gets stripped.
- Fix: After stitch, check every H3 for an immediately following paragraph.
  If H3 has no following <p> before the next heading, either remove the H3
  or merge the stripped sentence back.
- Risk: Low — structural cleanup post-stitch.
- Test: No H3 heading exists without at least one following sentence.

### FIX-18 | insert-internal-links BUILD_MARKER missing
- Status: OPEN
- File: supabase/functions/insert-internal-links/index.ts
- Problem: No BUILD_MARKER — cannot verify what version is deployed.
- Fix: Add const BUILD_MARKER and console.log(BUILD_MARKER) at serve() entry.
- Risk: Zero — logging only.
- Test: Boot log shows insert-internal-links marker on first invocation.

---

# TIER 4 — PIPELINE INPUT QUALITY
# These affect content quality upstream of the code fixes.

### FIX-19 | Source grounding check is heuristic — not true fact verification
- Status: OPEN (architectural limitation, no quick fix)
- Problem: The Source Grounding Validator checks whether generated sentences
  contain words from the context file. It does NOT verify whether claims are
  factually correct. A sentence that copies a word from the context file
  passes even if the claim is wrong.
- Fix: Not fixable with current architecture. Requires an external fact-check
  API or a secondary model call that compares each claim against the source.
  Document this limitation clearly in the UI tooltip.
- Risk: N/A — documentation change only in short term.

### FIX-20 | Value promise check is heuristic — word presence not depth
- Status: OPEN (architectural limitation)
- Problem: The value promise validator checks whether claim words appear in
  the article. It does not check whether the article deeply fulfils the
  promise, only that the words are present.
- Fix: Add a secondary check — for each value promise, verify it appears in
  at least one H2 heading AND at least one bullet point. Presence in body
  prose alone does not count.
- Risk: Low — adds two additional checks to existing validator.
- Test: Value promise with zero H2 coverage fails the check.

### FIX-21 | Fallback tables are hardcoded for dental topics only
- Status: OPEN
- File: proprietary-generate-article/index.ts
- Function: ensureMinimumTables
- Problem: When model fails to generate tables, the fallback only has
  hardcoded table templates for dental/medical topics. Non-medical topics
  (jersey stitching, sports) get a generic empty table.
- Fix: Make fallback table generation topic-aware by deriving column headers
  from the topic string and value promises rather than hardcoded domain maps.
- Risk: Low — fallback only, does not affect model-generated tables.
- Test: Jersey stitching article fallback table has jersey-specific columns.

### FIX-22 | Gemini deep research prompt — confirm v2 is live in Lovable UI
- Status: COMMITTED (8ca8cc95) — awaiting Lovable confirmation
- File: src/lib/deepResearchPrompt.ts
- Fix: v2 prompt committed. Pull 8ca8cc95 in Lovable and confirm keyword
  research UI uses the new 8-section prompt.
- Test: Keyword research output includes information gap analysis section.

---

# TIER 5 — ARCHITECTURE
# Long-term fixes that prevent the entire class of bugs above.
# Do not attempt without completing Tier 1-3 first.

### FIX-23 | Lovable two-way sync — disable immediately
- Status: OPEN — DO THIS BEFORE ANY OTHER SESSION
- Location: Lovable Settings → GitHub → disable two-way sync
- Problem: Lovable writes back to GitHub on auto-sync, overwriting GitHub
  commits. This is why fixes disappeared overnight.
- Fix: Disable two-way sync. GitHub → Lovable only. Lovable never writes back.
- Risk: Zero.
- Time: 2 minutes.

### FIX-24 | package-lock.json mismatch — blocks npm ci
- Status: OPEN
- File: package-lock.json
- Problem: npm ci fails, blocking local test runs.
- Fix: npm install → commit regenerated lockfile.
- Risk: Low.

### FIX-25 | Shared articlePipeline module — eliminate duplicate rendering
- Status: OPEN (4-6 weeks)
- Problem: Preview and export use different rendering code. Fixing one
  leaves the other broken. Every formatting fix has to be applied twice.
- Fix: Extract to src/lib/articlePipeline/:
  renderArticleHtml.ts, sanitiseArticleMarkdown.ts, extractReferences.ts,
  buildTrustBox.ts, buildCTA.ts, validateArticleStructure.ts
  Both preview and export call same renderer.
- Risk: HIGH — full refactor. Do not start without comprehensive test suite.

### FIX-26 | Structured content model — eliminate regex-patch cycle
- Status: OPEN (6-8 weeks, after FIX-25)
- Problem: Every regex fix fights another regex fix. Root cause: the pipeline
  treats the article as a raw string being progressively mutated.
- Fix: Treat article as structured object throughout:
  { title, directAnswer, tldr, sections[], quickTips[], ctas[],
    references[], faq[], trustBox }
  Render HTML from structure. No string mutation after rendering.
  Eliminates ALL regex-patch bugs permanently.
- Risk: Complete pipeline rewrite. Do not attempt before FIX-25.

---

# DONE — Confirmed fixed and deployed

| Fix | Description | Deployed |
|-----|-------------|---------|
| A7 | SKIP_HOSTS/PRODUCT_URL_RE removed | ✓ |
| A8 | Numbered refs, UTF-8-safe titles, dedupe, accessed suffix | ✓ |
| A9 | Per-hyperlink URL pairing in parse-context-file | ✓ 26242621ba |
| B1-a | F.U.S.E. abbreviation collapse in TL;DR merge | ✓ b230a5d5 |
| B1-b | Section bleed strip (inline ## headings) | ✓ b230a5d5 |
| B1-c | Inline source fragments strip ("compiled from X.docx") | ✓ b230a5d5 |
| B1-d | Quick Tips count guard (fires fallback when < 3 valid tips) | ✓ b230a5d5 |
| B2-a | Decimal repair: "0. 4" → "0.4" post-stitch | ✓ 08bfb53b3c |
| B2-b | Nav snippet ### strip (firstSentenceOf inline heading filter) | ✓ 08bfb53b3c |
| B2-c | CTA template hole: "with our ." / "for your ." stripped | ✓ 1c273512a7 |
| B2-d | apply-format BUILD_MARKER added | ✓ 1c273512a7 |
| UI-1 | Regenerate button on pending white cards in ContentQueue | ✓ |
| UI-2 | Generator opens in new tab (KeywordClustering sendToGenerator) | ✓ c3ad2799 |
| INFRA | CLAUDE.md created | ✓ 89bc0fa0 |
| INFRA | integration-test.mjs — 28-rule live test suite | ✓ e3230aea |
| INFRA | MASTER_FIX_LIST.md — this file | ✓ |

---

# CURRENT DEPLOYED MARKERS

| Function | Commit | Marker |
|---|---|---|
| proprietary-generate-article | 08bfb53b3c | BUILD-2026-06-09-B2-decimal-nav |
| apply-format | 1c273512a7 | BUILD-2026-06-09-B2-cta-fix |
| parse-context-file | 26242621ba | BUILD-2026-06-09-A9-pairing |
| insert-internal-links | 4304a9d42a | no marker — FIX-18 pending |

---

# ARTICLE QUALITY SCORE (Jersey Stitching with context file, B2 deployed)
# Last tested: 2026-06-09

| Category | Rules | Passing | Failing |
|---|---|---|---|
| Structure | 8 | 8 | 0 |
| Content quality | 8 | 5 | 3 (FIX-01, FIX-03, orphan brackets) |
| CTAs | 4 | 3 | 1 (FIX-02 emoji) |
| References | 4 | 4 | 0 |
| Schema/SEO | 4 | 4 | 0 |
| How to Choose | 1 | 0 | 1 (FIX-04) |
| FAQ quality | 1 | 1 | 0 |
| **TOTAL** | **28** | **16** (wait for recount after B2) | **5** |

