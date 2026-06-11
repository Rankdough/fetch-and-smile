# fetch-and-smile — Master Fix List
# This is the bible. Every fix we need to do, in priority order.
# Updated: 2026-06-09
# Based on: 3 days of debugging + Codex audit + HTML article analysis

---

## HOW TO USE THIS LIST
- Fix one item at a time. One commit per fix.
- Read CLAUDE.md + last 5 commits before starting each session.
- Run integration-test.mjs before every deploy.
- Mark each fix DONE only after boot log confirmed + article output checked.
- Update CLAUDE.md markers after every deploy.

---

## TIER 1 — BREAKING BUGS (visible failures in every article)

### FIX-01: F.U.S.E. abbreviation protection — move before sentence splitter
- Status: OPEN
- File: supabase/functions/proprietary-generate-article/index.ts
- Function: sentence tokeniser / splitSentences (before any splitting occurs)
- What breaks: "Nike Vapor F.U.S.E." splits into "F. U. S." and "E." as separate
  sentences, causing TL;DR to fragment into 4+ blocks, FAQ Q3 to truncate
  mid-sentence, and body prose to split incorrectly.
- Root cause: B2 fix runs F.U.S.E. collapse in the TL;DR merge step, AFTER
  sentence splitting already ran. Needs to run BEFORE any sentence splitting.
- Fix: Add /\b([A-Z])\.([A-Z])\.([A-Z])\.([A-Z])\./g and similar abbreviation
  patterns as PROTECTED TOKENS in the sentence tokeniser, same as decimal
  protection. Replace with placeholder before splitting, restore after.
- Risk: Low — same pattern as decimal protection already in place.
- Breaks if wrong: TL;DR fragmentation, FAQ truncation, body splits.
- Guard: Article with "F.U.S.E." or "U.S.A." or "N.B.A." must render intact.

### FIX-02: CTA broken emoji (replacement character \uFFFD)
- Status: OPEN
- File: supabase/functions/apply-format/index.ts
- Function: CTA headline builder
- What breaks: CTA headline shows "🔥 CUSTOMIZE YOUR GAME-DAY LOOK!" corrupted
  to "⚫ CUSTOMIZE YOUR GAME-DAY LOOK!" — 4-byte emoji sliced mid-codepoint.
- Root cause: apply-format slices the CTA headline string at a byte boundary
  that splits a multi-byte emoji codepoint.
- Fix: Strip all emoji from CTA headlines entirely in the post-process step.
  Add: ctaHeadline = ctaHeadline.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim()
  OR use [...str].slice() (code-point safe) instead of str.slice().
- Risk: Low — scoped to CTA headline string only.
- Guard: No \uFFFD character in any CTA block.

### FIX-03: TL;DR renders as multiple styled blocks instead of one
- Status: PARTIALLY FIXED (B2 merged content but F.U.S.E. splits it again)
- File: supabase/functions/proprietary-generate-article/index.ts
- Function: stitch kind=tldr
- What breaks: TL;DR shows 2-5 separate styled <p> blocks instead of one.
- Root cause: F.U.S.E. split (FIX-01) is the primary cause. Secondary cause:
  the HTML renderer in Index.tsx styles each <p> independently with separate
  border-radius, so there is no single wrapper div around the TL;DR content.
- Fix: FIX-01 resolves the split. Additionally, wrap TL;DR H2 + all following
  P elements in a single container div before styling, so they render as one
  visual block regardless of paragraph count.
- Risk: Medium — HTML renderer change in Index.tsx affects visual layout.
- Guard: TL;DR block must be one contiguous visual element, single top-right
  and bottom-right border-radius pair.

### FIX-04: How to Choose section absent from every article
- Status: OPEN
- File: supabase/functions/proprietary-generate-article/index.ts
- Function: injectHowToChoose + topicNoun()
- What breaks: The How to Choose section is in the AEO spec but never appears.
- Root cause: topicNoun() returns generic "Option" for unrecognised topics,
  producing heading "How to Choose the Right Option" with boilerplate criteria.
  Section is injected but too generic to be useful or visible.
- Fix: When topicNoun() returns "Option", extract first 3-4 meaningful words
  from the topic string directly. Strip subtitle separators (colon, pipe).
  e.g. "NBA and NFL Jersey Stitching" → "Jersey Stitching"
- Risk: Low — contained to injectHowToChoose function.
- Guard: After fix, "How to Choose" H2 must contain topic-specific words.
  In This Article nav must show 5 sections (not 4).

### FIX-05: FAQ Q4 and Q5 boilerplate filler
- Status: OPEN
- File: src/pages/FAQAccordion.tsx (or src/components/FAQAccordion.tsx)
- Function: buildFallbackFaqItems
- What breaks: FAQ Q4 = "What is the main point of [article title]?"
  FAQ Q5 = "How should someone use this information about [article title]?"
  These are generic template fillers that look unprofessional.
- Root cause: The edge function correctly fills to 5 Q&A pairs, but the
  frontend FAQAccordion.tsx component has its own generic fallback that
  overwrites Q4/Q5 when it cannot parse the edge function output.
- Fix: Replace buildFallbackFaqItems generic template with a version that
  derives Q4/Q5 from the article H2 headings — same approach the edge
  function uses. Null-safe: if fewer than 2 H2 headings available, keep
  current generic template rather than throwing.
- Risk: HIGH — frontend component, no edge function safety net. A crash
  removes all 5 FAQ pairs AND the schema markup from the page simultaneously.
  Test thoroughly before deploying.
- Guard: Verify all 5 FAQ pairs render. Verify Q4/Q5 differ from Q1-Q3.
  Verify accordion expand/collapse still works. Verify schema.org markup present.

---

## TIER 2 — QUALITY BUGS (affect output quality, not structural integrity)

### FIX-06: Quick Tips content is generic reformulations, not real tips
- Status: OPEN
- File: supabase/functions/proprietary-generate-article/index.ts
- Function: buildFallbackQuickTips + normaliseQuickTipsContent
- What breaks: Quick Tips shows 3 bullets that restate the topic instead of
  giving actionable advice. e.g. "Understand NBA and NFL jersey stitches differ
  before committing to a plan" — this is not a tip.
- Root cause: buildFallbackQuickTips generates tips from H2 headings, producing
  "Understand [H2 question] before committing" which is always generic.
- Fix: Improve buildFallbackQuickTips to generate action-oriented tips using
  the topic and value promises, not H2 headings. Template: "Always [action]
  when [context] to [benefit]."
- Risk: Low — only fires when model Quick Tips fail the count check.

### FIX-07: CTA minimum not enforced (sometimes only 1 CTA appears)
- Status: OPEN
- File: supabase/functions/apply-format/index.ts
- Function: ctaBlockPattern enforcement
- What breaks: Articles occasionally have only 1 CTA instead of required 2.
- Root cause: apply-format enforces max 2 but has no minimum enforcement.
  When model generates 1 CTA, apply-format accepts it.
- Fix: After max-2 enforcement, check if count < 2. If so, inject a second
  CTA before Final Thoughts using the deterministic blockquote template.
  Guard: null-check ctaConfig.url and ctaConfig.brandName before injecting.
- Risk: Medium — injected CTA must not land inside References section.
  Verify placement is before Final Thoughts.

### FIX-08: CTA copy generic ("Premium Stitching · Unlimited Designs")
- Status: OPEN
- File: supabase/functions/apply-format/index.ts
- Function: CTA description / tagline builder
- What breaks: CTA tagline is generic, not derived from article topic.
- Root cause: apply-format prompt instructs model to derive CTA from topic,
  but model falls back to generic benefits when topic is not sports-specific.
- Fix: Strengthen the prompt instruction: require at least 2 words from the
  article topic in the CTA tagline. Add a post-process check and regenerate
  if topic words are absent.
- Risk: Low — prompt-level change only.

### FIX-09: Author byline lowercase topic ("Nba and nfl jersey stitching Specialist")
- Status: OPEN
- File: src/pages/Index.tsx (or trust box injection)
- Function: Trust box author byline builder
- What breaks: Topic string is not title-cased when injected into the
  specialist label, producing "Nba and nfl jersey stitching Specialist".
- Root cause: The topic string is injected raw without title-case conversion.
- Fix: Apply title-case to the topic token before injecting into the byline.
  e.g. topic.replace(/\b\w/g, c => c.toUpperCase())
- Risk: Very low — single string transform, no structural change.

### FIX-10: Inline source fragments "compiled from" still appearing
- Status: PARTIALLY FIXED (B1 added the pattern, needs verification)
- File: supabase/functions/proprietary-generate-article/index.ts
- Function: stripInlineSourceFragments
- What breaks: "This data was compiled from Jersey Stitching Research Analysis"
  appears in body paragraphs.
- Root cause: The B1 regex targets "compiled from X.docx" but may miss
  instances where the filename is written without extension.
- Fix: Broaden the regex to match any trailing phrase after "compiled from"
  regardless of whether it ends in .docx.
- Risk: Low — scoped regex on body text.

---

## TIER 3 — ARCHITECTURAL FIXES (prevent future regressions)

### FIX-11: Shared articlePipeline module — eliminate duplicate rendering paths
- Status: OPEN (major engineering work, 4-6 weeks)
- Files: src/lib/articlePipeline/ (new directory)
- What breaks: Preview and exported HTML use different rendering code.
  Fixing one path leaves the other broken. Every formatting fix has to be
  applied in multiple places.
- Fix: Extract shared modules:
  - renderArticleHtml.ts
  - sanitiseArticleMarkdown.ts
  - extractReferences.ts
  - buildTrustBox.ts
  - buildCTA.ts
  - validateArticleStructure.ts
  Both preview and export call the same renderer. No duplication.
- Risk: HIGH — major refactor touching every rendering path. Requires
  comprehensive testing before deploy. Do not attempt without full test suite.

### FIX-12: Structured content model — eliminate regex-patch cycle
- Status: OPEN (major engineering work, 6-8 weeks, follows FIX-11)
- What breaks: Every regex patch that fixes one thing breaks another.
  The sentence splitter, decimal protection, bleed strip, TL;DR merge are
  all fighting each other because they operate on the same raw string.
- Fix: Treat the article as a structured data object throughout the pipeline:
  { title, directAnswer, tldr, sections[], quickTips[], ctas[], references[],
    faq[], trustBox }
  Render HTML from structure. No string mutation after rendering.
  This eliminates ALL the regex-patch bugs permanently.
- Risk: Complete rewrite of the pipeline. Do not attempt before FIX-11.

### FIX-13: Lovable two-way sync — disable to prevent overnight overwrites
- Status: OPEN (configuration, 2 minutes)
- Location: Lovable Settings → GitHub → disable two-way sync
- What breaks: Lovable writes back to GitHub on auto-sync, overwriting
  GitHub commits. This is why fixes disappear overnight.
- Fix: Disable two-way sync. GitHub writes to Lovable only. Lovable never
  writes back to GitHub. All code changes go through Claude → GitHub → Lovable.
- Risk: Zero. This is a configuration change, not a code change.
- DO THIS FIRST before any other fix in a new session.

### FIX-14: package-lock.json mismatch — blocks npm ci and local test runs
- Status: OPEN
- File: package-lock.json
- What breaks: npm ci fails due to lockfile mismatch with package.json.
  Blocks running integration-test.mjs locally.
- Fix: Run npm install to regenerate package-lock.json. Commit updated file.
- Risk: Low — lockfile only, no code change.

### FIX-15: insert-internal-links has no BUILD_MARKER
- Status: OPEN
- File: supabase/functions/insert-internal-links/index.ts
- What breaks: Cannot verify what version is live. Flying blind on this function.
- Fix: Add BUILD_MARKER constant and console.log(BUILD_MARKER) at serve() entry.
- Risk: Zero — adds logging only.

---

## TIER 4 — PIPELINE INPUT QUALITY (upstream of code, affects all articles)

### FIX-16: Source grounding at 0% when transcript used instead of docx upload
- Status: OPEN
- What breaks: When context is pasted as transcript text instead of uploaded as
  docx, the Source Grounding Validator shows 0% from context files.
  The generator uses general model knowledge instead of the research file.
- Root cause: The transcript field is treated as a different source type than
  context files. The grounding check only validates against context file content.
- Fix: Ensure the generator treats transcript text with equal weight as context
  file content for grounding validation.

### FIX-17: Gemini deep research prompt — wire value promises as structured deliverables
- Status: COMMITTED (8ca8cc95) — awaiting Lovable confirm
- File: src/lib/deepResearchPrompt.ts
- What breaks: Gemini returns generic content when value promises are not
  structured as specific data deliverables.
- Fix: Done. v2 prompt with 8 sections including information gap analysis,
  non-commodity audit, direct answers per keyword cluster, keyword-to-promise map.
- Status: Committed to GitHub at 8ca8cc95. Pull and confirm in Lovable UI.

### FIX-18: References filter — apply simple block list only (not authority scoring)
- Status: OPEN (design decision made, implementation pending)
- File: supabase/functions/proprietary-generate-article/index.ts
- Function: dedupeAndValidateRefs
- What breaks: Context file URLs from trusted sources get filtered out by
  overly strict authority rules.
- Fix: Trust user-curated context file URLs. Block list only:
  reddit, quora, medium, pinterest, tumblr, buzzfeed, AI content farms.
  No tier scoring. User curation is the authority filter.

---

## DONE — Confirmed fixed and deployed

- A7: SKIP_HOSTS/PRODUCT_URL_RE removed from context-file extraction
- A8: Numbered references, UTF-8-safe titles, title dedupe, accessed suffix stripped
- A9: Per-hyperlink URL pairing in parse-context-file (each [title](url) paired)
- B1: F.U.S.E. abbreviation collapse (TL;DR merge), section bleed strip,
      inline source fragments strip, Quick Tips count guard
- B2: Decimal repair (0. 4→0.4), nav snippet ### strip, CTA template hole fix,
      apply-format BUILD_MARKER added
- CLAUDE.md created and committed
- integration-test.mjs committed (28-rule test suite)
- regression-test.mjs extended (pure function tests)
- deepResearchPrompt.ts v2 committed
- Regenerate button added to ContentQueue.tsx
- Generator opens in new tab (KeywordClustering.tsx)

---

## CURRENT DEPLOYED MARKERS (update after every deploy)

| Function | Commit | Marker |
|---|---|---|
| proprietary-generate-article | 08bfb53b3c | BUILD-2026-06-09-B2-decimal-nav |
| apply-format | 1c273512a7 | BUILD-2026-06-09-B2-cta-fix |
| parse-context-file | 26242621ba | BUILD-2026-06-09-A9-pairing |
| insert-internal-links | 4304a9d42a | no marker |

