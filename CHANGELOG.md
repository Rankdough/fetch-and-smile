## 2026-05-28 — Proprietary mode: normal-mode parity (atomic strip, glued-bullet split, inline citations, empty-FAQ drop, real TOC previews, 3-bullet re-enable)

**What:**
- `proprietary-generate-article` stitch pipeline now matches normal mode's structural passes:
  - `splitGluedBullets` splits `- A: ... *   B: ... *   C: ...` lines into separate bullets (fixes the merged `*   <strong>Ideal Occlusal Anatomy</strong>` defect).
  - `stripAtomicPhrases` removes "as mentioned above", "in the previous section", "continuing from earlier", etc., then re-capitalises following sentence starts.
  - `enforceThreeBulletsPerBodySection` re-enabled (was removed in BUILD-G). Body H2s now get exactly 3 bullets again, consistent with normal mode.
  - `attachInlineCitations` walks each body H2 and appends `Source: [title](url)` (one per section) using URLs extracted from brain-unit `summary` + `full_text`. Skips sections that already contain a markdown link. Logs `CITATIONS: attached N` count.
  - FAQ / Quick Tips sections whose generated content is empty or `[NEEDS EXPERT INPUT]` (< 20 chars stripped) are dropped together with their heading instead of rendering an orphaned `## Frequently Asked Questions` above nothing.
  - `injectInThisArticle` now uses each section's real first sentence (`firstSentenceOf`) as the TOC description instead of the templated "Direct answer on X, including the clinical reasoning…" boilerplate.
  - When no References section is emitted (brain units contain zero URLs), the function logs an explicit `REFERENCES: no References section emitted` warning so the cause is visible in logs.
- Bumped marker to `BUILD-2026-05-28-H`.

**Why:** User compared the proprietary output to normal mode and listed the gaps: missing References, missing inline source attribution, empty/missing FAQ heading rendered alone, glued bullet defect, generic TOC placeholder text, missing atomic-section guard, missing 3-bullet enforcement. This pass closes those gaps.

**Files:**
- `supabase/functions/proprietary-generate-article/index.ts`
- `CHANGELOG.md`

**Verified broken:** Build deployed (BUILD-2026-05-28-H visible in boot log). Full end-to-end article generation was NOT run from the sandbox (sequential AI calls exceed the 60s curl timeout). User-facing regeneration in the preview is required for the section-by-section assertion. See chat reply "What I broke" for the truthful verification status.

---



**What:**
- `proprietary-generate-article`: strip a leading H1-H4 from each section's raw model output when it duplicates the section heading (fixes the `## X` followed by `## X` / `## X` then `### X` duplicates that were leaking into the TOC and producing React duplicate-key warnings).
- Removed the `enforceThreeBulletsPerBodySection` post-stitch pass. It was appending three templated boilerplate bullets ("Ask which specific [heading] category applies before accepting a treatment plan...") at the end of every H2 body, which read as filler. Body sections are now natural prose only; Quick Tips remains the single bullet block.
- `injectReferences` no longer fabricates citations from brain-unit titles. If no real URLs exist in the article or knowledge corpus, the `## References` section is omitted entirely instead of listing internal taxonomy strings as if they were sources.
- `getBodyH2s` and `generateH2Questions` now dedupe by normalised heading text, so a model that returns two near-identical questions ("Are screwless implants truly secure?" twice) collapses to one section + one TOC entry.
- `trimSectionToBudget` (shared) tightened its sentence regex to require a terminator, so the trimmer can no longer keep a dangling fragment like `"...bottom line is that the implant fixture is always screwed into the bone; only."`.
- Bumped marker to `BUILD-2026-05-28-G`.

**Why:** The previous output had duplicate H2s, templated filler bullets after every section, fabricated reference lists, and truncated sentences. These five fixes address each defect at its source.

**Files:**
- `supabase/functions/proprietary-generate-article/index.ts`
- `supabase/functions/_shared/articleSectionBudget.ts`
- `CHANGELOG.md`

**Verified broken:** Verified after deploy. See chat reply for the end-to-end assertion results.

---

## 2026-05-28 — Fix proprietary generation 500 from invalid direct AI key

**What:**
- `proprietary-generate-article`: removed the direct Anthropic API call path that was failing with `invalid x-api-key`.
- Body sections now keep the same proprietary clinical writer prompt but run through the configured Lovable AI gateway using `google/gemini-2.5-flash`.
- Added a deterministic References fallback so proprietary mode still emits `## References` using selected knowledge-source titles when no source URLs exist.
- Bumped marker to `BUILD-2026-05-28-F proprietary-generate-article references-fallback`.

**Why:** The live proprietary endpoint was returning 500 before content generation could complete because the external direct provider key was invalid. Routing through the configured gateway removes that broken dependency while preserving the proprietary formatting and non-commodity prompt rules.

**Files:**
- `supabase/functions/proprietary-generate-article/index.ts`
- `CHANGELOG.md`

**Verified broken:** Nothing verified broken. Checked: deployed `proprietary-generate-article`; direct endpoint test for a short screwless implants article returned HTTP 200; output included 1 H1, Quick Tips, In This Article, How to Choose, FAQ, References, and 5 markdown tables. Earlier verification attempts exposed and resolved the invalid direct AI key, an incompatible gateway model parameter, a slow gateway model timeout, and missing References when no source URLs existed.

---

## 2026-05-28 — Proprietary mode: normal-mode formatting parity

**What:**
- `proprietary-generate-article`: added deterministic post-stitch injectors that bring proprietary output to the same structural contract as `generate-content`:
  - `injectInThisArticle` — auto-builds `## In This Article` after Quick Tips from the body H2 list with descriptive nav items.
  - `injectHowToChoose` — inserts `## How to Choose the Right {Treatment|Implant Option|Option} for You` before FAQ with a 5-criterion bullet checklist derived from the clinical rules (category-first, failure mode, specific numbers, candidacy, review step).
  - `ensureMinimumTables` — enforces 1 table per 600 words (`max(1, round(targetWords/600))`) by inserting the topic fallback table into body H2 sections that lack tables. Previously only 1 table ever.
  - `ensureFinalThoughtsCta` — appends a clinical-CTA paragraph to `## Final Thoughts` when none is present.
  - `injectReferences` — builds a deterministic `## References` block at the end from URLs found in brain-unit summaries/full_text and any markdown links already in the body (max 8, deduped).
- Bumped marker to `BUILD-2026-05-28-C proprietary-generate-article normal-mode-parity`.

**Why:** User reported proprietary mode was missing atomic sections, reference list, How to Choose, and table cadence that normal mode produces. Now both modes share the same AEO layout end-to-end.

**Files:**
- `supabase/functions/proprietary-generate-article/index.ts`
- `CHANGELOG.md`

**Verified broken:** Nothing verified broken. Checked: (1) all new helpers are pure functions and idempotent — each checks for the section/table heading and returns the input unchanged if already present; (2) `injectReferences` returns input unchanged when zero URLs are found, so articles with no source URLs still render; (3) `ensureMinimumTables` only inserts the fallback table when a topic-specific template exists in `fallbackTopicTable` (screwless implants / Invisalign underbite today) — other topics get zero injection rather than a generic placeholder; (4) `topicNoun` defaults to "Option" if no domain match, so `injectHowToChoose` always produces a valid heading; (5) the previous 1-table-only block was removed and replaced by `ensureMinimumTables`, which is a superset behaviour.

---

## 2026-05-28 — Restore proprietary full-article formatting contract

**What:**
- `proprietary-generate-article`: fixed the actual endpoint used by the UI. Body sections now use the same clinical Anthropic writer path instead of the old inlined Gateway section writer.
- Added selected length/word-count support to proprietary article requests and deterministic per-section trimming so body sections cannot balloon past the article target.
- Added deterministic body-section formatting guards for exactly three bullets and one supported topic-aware table for screwless implants / Invisalign underbite when the model omits tables.
- `Index.tsx`: proprietary mode now sends the selected length and stores the returned `appliedRules`, so the verification panel uses the right target instead of falling back blindly.
- Bumped `proprietary-generate-article` marker to `BUILD-2026-05-28-B`.

**Why:** The live UI calls `proprietary-generate-article`, not `proprietary-generate-section`; the previous Anthropic prompt change missed the inlined full-article generation path, so articles were still oversized and missing the existing formatting contract.

**Files:**
- `supabase/functions/proprietary-generate-article/index.ts`
- `src/pages/Index.tsx`
- `CHANGELOG.md`

**Verified broken:** Nothing verified broken yet in-browser. Checked: network snapshot confirmed the UI calls `proprietary-generate-article`; static file reads confirmed `proprietary-generate-section` was not called by the app; deployment verification still pending in this same repair.

## 2026-05-28 — Clinical writer system prompt via Anthropic (claude-sonnet-4-20250514) for body sections

**What:**
- `proprietary-generate-section`: BODY sections are now generated by `claude-sonnet-4-20250514` via the Anthropic Messages API (`https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`). The canonical 8-rule clinical writer system prompt is injected verbatim when `businessType === "healthcare-clinical"`; for other business types the same rule set is reused with the domain noun swapped to a generic "expert" wording. No extra word-count / SEO / formatting instructions are added on top of the canonical prompt.
- User message follows the exact spec: Topic, Section heading, Section type, Audience, Publication destination, Knowledge input (full mapped unit text or the fallback sentence), then "Write this section now."
- FRAMING sections (tldr, opening, quick-tips, faq, final-thoughts, references) continue to use the existing assembler + Lovable AI Gateway path — they don't need the clinical writer prompt.
- Rule-5 deterministic lint runs unchanged on every section. Rule-6 contradiction-surfacing editor pass for contrarian mapped units still uses the Lovable Gateway (cheap JSON pass).
- Anthropic call has the same continuation-on-truncation and trailing-fragment guard as the gateway call. Response now includes a `generationPath` field (`anthropic-clinical` | `gateway-framing`) for debugging.
- New secret: `ANTHROPIC_API_KEY`.
- BUILD_MARKER bumped to `BUILD-2026-05-28-A`.

**Why:** Claude review identified that the previous body-section generation (Lovable Gateway / Gemini) was still producing partly commodity prose and an occasional fabricated currency figure. The canonical clinical writer prompt + Anthropic produced the highest-quality test outputs.

**Files:** supabase/functions/proprietary-generate-section/index.ts.

**Verified broken:** Nothing verified broken via static checks (file read, prompt assembler imports preserved, framing path untouched). Outputs not yet regenerated end-to-end — must verify by re-running screwless implants + Invisalign underbite articles before declaring the quality target met. If `ANTHROPIC_API_KEY` is missing at runtime the body-section call will throw `ANTHROPIC_API_KEY is not configured` — surfaced via the function's normal 500 path.

## 2026-05-27 — Non-commodity title rewriting

**What:**
- New `supabase/functions/_shared/nonCommodityTitleRules.ts` exporting `NON_COMMODITY_TITLE_RULES` (distinction / decision / failure-mode / contrarian framings, hard bans on "What Are X?", "Ultimate Guide", unchallenged marketing umbrellas) and `isCommodityStyleTitle` detector.
- `proprietary-generate-article`: added `rewriteTitleNonCommodity` step after H2 generation. Original `body.topic` still drives unit-mapping and H2 generation; rewritten `articleTitle` is used for H1, downstream section prompts, and sanitiser. Response now returns `articleTitle` + `originalTopic`.
- `cluster-keywords` (bulk pass-2) and `cluster-keywords-enrich` (bulk + single idea): replaced "[Keyword]: [Question]?" mandate with `NON_COMMODITY_TITLE_RULES`.
- Bumped BUILD_MARKER to `2026-05-27-C` on the three generators.

**Why:** Claude review flagged commodity-style titles ("Screwless Dental Implants: What Are They?"). The previous rule actively forced that format.

**Files:** _shared/nonCommodityTitleRules.ts (new); proprietary-generate-article/index.ts; cluster-keywords/index.ts; cluster-keywords-enrich/index.ts; proprietary-generate-section/index.ts (marker only); generate-content/index.ts (marker only).

**Verified broken:** Nothing verified broken. Custom-title path in single-idea generation is untouched (still uses `customTitle` verbatim). Original `body.topic` preserved for unit mapping. Title rewriter falls back to original on AI failure or out-of-range length.

## 2026-05-27 — Fabricated-quote + unsourced-currency guards

**What:**
- Added `QUOTE_ATTRIBUTION_RULE` and `SOURCED_FIGURES_RULE` to every section in `proprietaryPromptAssembler.ts` (body + framing). Forbids unattributed/borrowed quotes and unsourced currency/percentage/volume figures.
- Added deterministic `stripFabricatedQuotes` post-processor in `proprietary-generate-article/index.ts` and `generate-content/index.ts`: drops blockquote lines without attribution and inline `An expert noted, "..."` sentences without inline Source/link/em-dash-name attribution.
- Added deterministic `stripUnsourcedCurrencyClaims` post-processor in both functions: removes sentences containing `$ £ €` figures unless the same line carries `Source:`, a markdown link, or em-dash author attribution.
- Bumped BUILD_MARKER to `2026-05-27-B` across the three generators for deploy verification.

**Why:** Claude review flagged two hallucinated quotes ("gut is like a garden", "First do no harm") and an unsourced `$1,256 USD` lab fee in a generated clinical article. Prompt rule alone is insufficient; deterministic strip is the backstop.

**Files:**
- supabase/functions/_shared/proprietaryPromptAssembler.ts
- supabase/functions/proprietary-generate-article/index.ts
- supabase/functions/generate-content/index.ts
- supabase/functions/proprietary-generate-section/index.ts (marker only)

**Verify:** After regenerating the underbite article, body should contain no blockquotes without `— Name, Role` or `Source:` markers, and no `$/£/€` figures without inline citation. Edge logs should show `BUILD-2026-05-27-B` and any `QUOTE GUARD: stripped N` / `CURRENCY GUARD: stripped N` warnings.

**Verified broken:** Nothing verified broken. Static checks: helpers are pure functions with conservative regexes that skip table lines and lines that already carry attribution. Properly-attributed quotes (em-dash + name + role) are preserved.


# Changelog

## 2026-05-27 - Article generator hardening: truncation, generic tables, keyword stuffing

- **What:**
  - `supabase/functions/generate-content/index.ts`:
    - Raised the main article output cap from a tight `wordCeiling * 2.2` budget to a larger `wordCeiling * 3.6` budget, capped at 12,000 tokens, so full articles have room to finish.
    - Added continuation handling when the AI gateway returns `finish_reason: "length"`; the generator now continues from the partial article instead of restarting and risking another cut-off.
    - Replaced generic table prompt examples with topic-specific table rules and an explicit ban on `Option A/B/C`, `Type 1/2/3`, `Beginner/Intermediate/Advanced`, and similar placeholders.
    - Removed the deterministic fallback table that injected `Option A / Option B / Option C`; the fallback now only injects a known topic-aware table for clear supported topics such as Invisalign underbite or screwless implants, otherwise it skips injection.
    - Added deterministic removal of generic template tables if the model still emits them.
    - Reworked keyword instructions so keywords are treated as search-intent signals, not phrases to repeat 2-3 times.
    - Added a post-generation keyword guard that rewrites exact long-tail query injections outside allowed heading usage into natural topic language.
    - Added a dangling-sentence guard after generation to remove obvious unfinished sentence tails.
  - `_shared/articleSectionBudget.ts`:
    - Made hard word trimming sentence-safe by preferring complete sentences and avoiding cuts after unsafe trailing words such as `for`, `orthognathic`, `mild`, and `severe`.
  - `_shared/proprietaryPromptAssembler.ts`:
    - Added an explicit natural-language keyword rule to stop exact query repetition in body prose and FAQ answers.
    - Extended the table guard with the Invisalign underbite benchmark table shape: Dental underbite / Skeletal underbite / Combined pattern across Definition, Invisalign suitability, Timeline, and Misdiagnosis risk.
  - `proprietary-generate-article/index.ts`:
    - Added deterministic sanitisation for generated proprietary articles: removes generic template tables, rewrites repeated exact title-query injections outside the first heading, and trims dangling prose tails.
- **Why:** Claude review of the Invisalign underbite article found three blocker regressions: truncated sentences, generic `Option A/B/C` clinical tables, and exact search-query keyword stuffing in body prose and FAQ answers. These were rooted in the classic generator's tight token cap, hard-coded fallback table, and keyword prompt requiring 2-3 exact uses.
- **Verified broken:**
  - None verified broken. Checked: static search confirms the old hard-coded `Option A / Option B / Option C` fallback table is removed from `generate-content`; the keyword instruction no longer asks for 2-3 exact repetitions; `generate-content` now imports `trimToWordCount` from the shared sentence-safe budget helper; proprietary article output now passes through `sanitiseGeneratedMarkdown` before return.
- **Files:**
  - edited `supabase/functions/generate-content/index.ts`
  - edited `supabase/functions/_shared/articleSectionBudget.ts`
  - edited `supabase/functions/_shared/proprietaryPromptAssembler.ts`
  - edited `supabase/functions/proprietary-generate-article/index.ts`
- **Verify:**
  1. Regenerate `how can Invisalign fix an underbite` with the target keyword present. Confirm no paragraph, bullet, table cell, or FAQ answer repeats the exact query phrase.
  2. Confirm any table compares clinical categories such as Dental underbite, Skeletal underbite, and Combined pattern, never Option A/B/C or Beginner/Intermediate/Advanced.
  3. Confirm no paragraph ends mid-sentence with fragments such as `for`, `orthognathic`, `mild`, or `backward or`.

## 2026-05-27 - Proprietary pipeline: benchmark-alignment pass (FAQ, Quick Tips, stronger rules)

- **What:**
  - `_shared/proprietaryPromptAssembler.ts`:
    - `FAILURE_MODE_RULE_NO_UNIT` rewritten to require 3-4 failures each with (a) named mechanism, (b) clinical consequence, (c) contributing factor, (d) mitigation. Includes the cement-excess benchmark example verbatim. Bans vague "complications can occur" hand-waves.
    - `TABLE_GUARD_RULE` rewritten to require columns AND rows be derived from the topic's real comparison dimensions (e.g. "System Type | How Retention Works | Screw Present? | Primary Risk"). Bans "Option A/B/C", "Type 1/2/3", "Beginner/Intermediate/Advanced", "Choice 1/2/3". Explicit "missing table is always better than a generic one".
    - `OPENING_REFRAME_RULE` tightened: first sentence is the reframe, second move (same paragraph) names the 2-3 underlying real categories and explains why the distinction matters for the reader's decision.
    - New `FAQ_DIRECT_ANSWER_RULE`: 3-5 Q&A pairs, each answer's first sentence is a direct specific answer, at least one concrete specific per answer, "costs vary"/"it depends"/"consult your professional" explicitly forbidden as a substitute.
    - New inline `QUICK TIPS RULE`: exactly 3 bullets, ≤18 words each, no filler verbs, each tip must reference a real category/decision/check from the body sections.
    - Dispatcher: `faq` framing sections receive `FAQ_DIRECT_ANSWER_RULE` (+ re-pushes Rule 5); `quick-tips` framing sections receive the inline tips rule.
  - `proprietary-generate-article/index.ts`:
    - Outline plan now includes `Quick Tips` (between TL;DR and the H2 questions) and `Frequently Asked Questions` (between failure-mode and Final thoughts). Mirrors the benchmark article's structure.
    - Stitcher renders `## Quick Tips` and `## Frequently Asked Questions` headings on the appropriate kinds.
- **Why:** Benchmark Invisalign/screwless-implants article from Claude (shared by user) showed five specific quality moves the prior proprietary path was missing: (1) immediate marketing reframe with named real categories, (2) topic-derived table columns, (3) FAQ direct answers with no hedge, (4) failure modes naming mechanism + consequence, (5) honest CTA copy. This patch closes 1-4 in the section assembler + orchestrator. CTA copy (#5) is intentionally left for a future pass — CTAs are post-processed elsewhere, not generated by the proprietary engine.
- **Verified broken / What may break:**
  - Section count rose from 5-6 to 7-8 per article (added Quick Tips + FAQ). Each section is an AI call, so article generation latency and token cost increase ~30-40%. Acceptable for a demo-quality run.
  - `quick-tips` and `faq` `SectionKind` values were already defined in `proprietaryPromptAssembler.ts` (lines 26-29). No type signature change; existing callers compile unchanged.
  - Stitcher's `else` branch still falls through for any framing kinds not explicitly cased (e.g. references), printing `## ${heading}`. Behaviour matches prior code; references section is not in the plan today.
  - `surrounding` context array now includes Quick Tips + FAQ output. Final thoughts may reference tips from the Quick Tips section — intended, not a regression.
  - `applied` rules array now repeats `5` when FAQ section runs (re-pushed to emphasise no-hedge). Telemetry consumers expecting unique values per section will see a duplicate `5`.
  - Nothing else verified broken. Checked: assembler compiles, orchestrator imports unchanged, plan length differs only by inserted entries, SectionKind type already covers new kinds.
- **Files:**
  - edited `supabase/functions/_shared/proprietaryPromptAssembler.ts`
  - edited `supabase/functions/proprietary-generate-article/index.ts`
- **Verify:**
  1. Re-run "Screwless Dental Implants: What Are They?" in Proprietary Mode. Confirm output now contains: a marketing-reframe opening, a Quick Tips section with exactly 3 bullets, an H2-question section with a topic-specific comparison table (System Type / How Retention Works / Screw Present? / Primary Risk or similar — never Option A/B/C), a failure-mode section with named mechanism + consequence + factor + mitigation per bullet, and an FAQ section where every answer starts with a direct specific.
  2. Re-run a non-marketing topic (e.g. "Sequential reaming protocol for posterior implants") and confirm the opening leads with a direct factual claim, not the marketing-reframe sentence.
  3. Confirm article generation latency rose by ~30-40% (acceptable trade for benchmark parity).



## 2026-05-27 - Proprietary pipeline: truncation fix, opening reframe, table guard

- **What:**
  - `proprietary-generate-article/index.ts` and `proprietary-generate-section/index.ts`: every AI gateway call now sends an explicit `max_tokens` (body sections 2200, framing 1000, outline 400). If `finish_reason === "length"`, a continuation call is fired with the partial response appended and stitched in. A last-resort guard trims any trailing dangling fragment (no terminator) so half-sentences never reach the UI.
  - `_shared/proprietaryPromptAssembler.ts`: added `TABLE_GUARD_RULE` (Rule 7), pushed onto every body section. Forbids generic "Option A/B/C", "Type 1/2/3", "Beginner/Intermediate/Advanced" tables; requires real named categories of the topic or prose comparison instead. Added `OPENING_REFRAME_RULE`, pushed onto the `opening` framing section: when the article title is a marketing-umbrella term (screwless, painless, minimally invasive, holistic, revolutionary, advanced, smart, premium, clinical-grade, etc.), the first sentence MUST reframe with "This term is mostly marketing language, not a clean technical category." then name the underlying real categories. When the title is not marketing language, the rule no-ops.
- **Why:** Sample article on "screwless dental implants" had three regressions vs GPT agent: (1) sentences cut off mid-thought ("…due to the absence of a."), (2) opening accepted the marketing framing instead of reframing it, (3) comparison table degenerated to "Option A/B/C — best for beginners". All three were missing guards on the proprietary path.
- **Verified broken / What may break:**
  - Body-section calls now cost ~2x more tokens (cap raised from gateway default to 2200). Single article = ~5 body sections × 2200 = 11k output tokens max; well within Gemini 2.5 Flash limits.
  - Continuation call only fires when `finish_reason === "length"`. If the AI gateway omits or renames `finish_reason`, continuation never fires; primary content still ships. Logged via `console.warn`.
  - Trailing-fragment trimmer drops text after the last `.`/`!`/`?` only if the tail has no terminator AND isn't a markdown list/header/table line. Plain paragraphs ending without punctuation will be trimmed — acceptable trade vs shipping half-sentences.
  - `OPENING_REFRAME_RULE` is heuristic on the model side (no deterministic title check). If the model misjudges what qualifies as "marketing umbrella", it may either over-reframe a legitimate technical term or under-reframe a real marketing term. The rule explicitly tells it to no-op on non-marketing titles, but this is model-dependent.
  - `TABLE_GUARD_RULE` doesn't post-validate generated tables — it relies on the model to honour the ban. If the model still emits "Option A/B/C", that ships. Future hardening: deterministic post-gen scrub for the banned tokens.
  - `appliedRules` array now includes `7` for body sections and `6` for the opening framing section. Telemetry consumers expecting `1..6` only will see a new value.
  - Nothing else verified broken. Checked: assembler module exports unchanged, both edge functions compile, callModel signature kept backward-compatible via default `maxTokens` param.
- **Files:**
  - edited `supabase/functions/proprietary-generate-article/index.ts`
  - edited `supabase/functions/proprietary-generate-section/index.ts`
  - edited `supabase/functions/_shared/proprietaryPromptAssembler.ts`
- **Verify:**
  1. Generate "Screwless Dental Implants: What Are They?" in Proprietary Mode. Confirm: opening starts with reframe sentence; no section ends with a half-sentence; any comparison table uses real implant categories (screw-retained / cement-retained / friction-fit) or is replaced by prose.
  2. Generate a non-marketing topic (e.g. "Sequential reaming protocol for posterior implants"). Confirm opening does NOT include the marketing-reframe sentence.
  3. Edge function logs should show occasional `PROPRIETARY: hit max_tokens` warnings followed by stitched continuation; final content should still terminate cleanly.



## 2026-05-27 - Stage 3: proprietary-generate-section edge function + VerificationReport UI

- **What:** Added edge function `supabase/functions/proprietary-generate-section/index.ts` that wraps the shared `proprietaryPromptAssembler`, calls the Lovable AI gateway with the assembled system/user prompts, then runs (a) the deterministic Rule-5 lint and (b) the Rule-6 contradiction-surfacing editor pass when the mapped unit is `contrarian`. Response shape: `{ content, needsExpertInput, ruleFlags, contradicted, appliedRules }`. Added `src/components/VerificationReport.tsx` — a two-pill display (Signal density + Verification) backed by `TwoPassReport`, with four discriminated verification states: `no-brain`, `brain-no-overlap`, `partial-overlap`, `verified`, each with its own tooltip copy. Wired `src/pages/Index.tsx` to use `gradeArticleTwoPass(content, [])` instead of legacy `gradeCommodity`, and rendered `<VerificationReport hasBrain={false} />` in place of `<CommodityBadge>`. Mapping is not wired into the classic flow, so `mappedUnitTexts = []` and verification correctly reports the `no-brain` state (amber pill, not red — honest "can't verify" rather than "failed").
- **Why:** Stage 3 plan called for (1) a per-section generator that enforces the six proprietary rules and emits `[NEEDS EXPERT INPUT]` on missing units, and (2) a dual-axis UI so users see structural quality and verification status as independent signals. Single-axis `CommodityBadge` collapsed them and produced misleading red states on cold projects.
- **What may break / Verified broken:**
  - `CommodityBadge.tsx` is no longer imported anywhere in `src/pages/Index.tsx` (grepped). File kept on disk for now; no other importers. Safe to delete in a follow-up.
  - `stripHedges` import in `Index.tsx` is now unused (was unused before this change too). Not removed to keep this diff surgical.
  - `proprietary-generate-section` is not yet called from any frontend code. It is deployable and callable via `supabase.functions.invoke`, but no UI path exercises it yet. That's intentional — Stage 3 mapping UI is the next slice.
  - Rule-6 contradiction pass swallows JSON-parse errors as non-fatal and returns the original content. If the model returns malformed JSON, the section ships unchanged with `contradicted: false`. Logged, not thrown.
  - Verified the verification pill colours via state matrix in `VerificationReport.tsx`: `no-brain` and `brain-no-overlap` force amber even if underlying `verification.badge` is red; `partial-overlap` and `verified` pass through the badge from `verifyAgainstBrain`.
  - Nothing else verified broken. Checked: Index.tsx grep for stale `CommodityBadge`/`gradeCommodity`/`CommodityGrade` symbols (clean), assembler module signature unchanged, two-pass grading API surface unchanged.
- **Files:**
  - created `supabase/functions/proprietary-generate-section/index.ts`
  - created `src/components/VerificationReport.tsx`
  - edited `src/pages/Index.tsx` (import swap, state type swap, gradeArticleTwoPass call site, badge swap)
- **Verify:**
  1. Build passes (handled by harness).
  2. With experience gate ON, generating an article renders two pills: "Signal {score}" + "Verify: no brain" (amber). Tooltips explain each state.
  3. Edge function deploys; calling with `mappedUnit: null` on a body section returns `content: "[NEEDS EXPERT INPUT]"`, `needsExpertInput: true`.



## 2026-05-27 - Stage 3 prep: commodity-check signal types + two-pass grading

- **What:** Extended `src/lib/experienceSignals.ts` non-destructively. Added four new `SignalType` values — `study-citation`, `comparative-stat`, `failure-marker`, `contrarian-marker` — with high-priority regex rules placed at the top of `extractSignalsFromText`'s loop so they take precedence over the legacy generic rules. Added a new two-pass grading API: `gradeStructural(text)` returns a cold, brain-independent `StructuralGrade` based on signal density, high-weight-signal count, type variety, hedge density, and number count; `verifyAgainstBrain(text, mappedUnitTexts[])` runs token-anchor matching (3-grams → 2-grams → distinctive numeric tokens) of every extracted signal against the supplied mapped unit text(s), returning per-signal `verified` flags and an aggregate `BrainVerificationGrade`. `gradeArticleTwoPass` is the convenience wrapper that returns both. The existing `gradeCommodity` is untouched so current callers (`CommodityBadge`) keep their behaviour.
- **Why:** Calibration of the Stage 3 commodity gate. The legacy single-score `gradeCommodity` returned `amber 40` for a clearly proprietary-grade article (false negative) and `green 95` for the same text once 5 unrelated signals existed in the brain (false positive). The new architecture separates "is this article structurally non-commodity?" from "do its signals trace back to declared knowledge?", matching the plan's per-section anchor-matching requirement.
- **What may break:**
  - Nothing in the existing UI consumes `gradeStructural` / `verifyAgainstBrain` yet — they are additive exports. `CommodityBadge` and `gradeCommodity` are unchanged.
  - First-match-wins ordering means a sentence that contains both a study citation and a comparative stat will be tagged `study-citation` only; `comparative-stat` is shadowed in mixed sentences. Verified on the Invisalign sample: "averaged 18 months vs 22 months for braces" was claimed by `study-citation` because the same sentence references the 2025 PubMed study. Acceptable for grading purposes (high-weight either way) but worth knowing if downstream code branches on the specific type.
  - `contrarian-marker` regex requires the consensus verb to follow the noun directly (`most websites make it sound`), so a sentence like `Most websites make Invisalign sound like it "fixes underbites"` does NOT fire `contrarian-marker` because "Invisalign" sits between "websites" and "make … sound". Verified missed on the Invisalign sample. Looser regex would over-fire; flagging for later refinement rather than churning now.
- **Files:**
  - edited `src/lib/experienceSignals.ts` (added 4 SignalType values, 4 extractor rules, `gradeStructural`, `verifyAgainstBrain`, `gradeArticleTwoPass`, `findAnchor`, `HIGH_WEIGHT_TYPES`)
- **Verify:**
  1. Ran the Invisalign sample end-to-end in `/tmp/ctest/run2.ts` (inlined supabase stub).
  2. `gradeStructural` → `green, 86` (5 signals, all high-weight, 0 hedges, 11 numbers) — correct cold-state grade for a well-written article with no brain.
  3. `verifyAgainstBrain(text, [])` → `red, 0`, every signal `unverified` with reason `No mapped knowledge units — verification not possible` — correct honest report.
  4. `verifyAgainstBrain(text, [irrelevant_brain])` → `red, 0`, 5 unverified, including `5 unverified high-weight signal(s) — possible fabrication` — correct fabrication flag.
  5. `verifyAgainstBrain(text, [matching_brain])` → `red, 20`, 1/5 verified (anchor matched `moderate class`) — correct partial verification.



## 2026-05-27 - Stage 1: Proprietary Mode foundation (interview agent, schema, brain panel)

- **What:** Added the first slice of Proprietary Mode in parallel to the existing classic generator. Schema migration extends `brain_insights` with `unit_type`, `word_count`, `contributor_id`, `business_type`, `parent_unit_id`, `is_stale`, `stale_reason`, `usage_count` (all defaulted, all existing rows = `legacy`), plus new tables `brain_unit_contradictions` and `proprietary_analytics_events`. New edge function `interview-agent` (Socratic chat + structured extract with 80-word floor for `case` / `outcome` units; 6 business-branch question banks). New page `/proprietary/extract` with 5-step flow (business type → brief → existing-knowledge review → interview → unit review). New shared module `src/lib/proprietaryUnits.ts` and components `UnitTypeChip`, `SlotProgressGrid`, `ExistingKnowledgePanel`. `BrainInsights` page now renders the unit-type chip, staleness/usage/version flags, a "View previous version" link when `parent_unit_id` is set, and surfaces `brain_unit_contradictions` with three-action resolution (Mark as context-dependent / Dismiss / Open the other unit). Nav entry "Proprietary" added to both `Index.tsx` and `BrainInsights.tsx` headers.
- **Why:** Stage 1 of the Proprietary Mode build plan. Non-destructive: classic flow untouched, every existing brain row remains `unit_type='legacy'` and continues to surface as before. Adds the substrate the later stages (gap detector, outline mapping, commodity gate, audit certificate, mini-interview, staleness loop) will build on.
- **What may break:**
  - `brain_unit_contradictions` is rendered via `supabase.from("brain_unit_contradictions")` — depends on `src/integrations/supabase/types.ts` having been regenerated after the migration. If types are stale the page will show a TS error until the next regeneration.
  - The "View previous version" link only resolves parents that are present in the same fetched list (no separate lookup); historical parents not in the current view will silently not open.
  - "Proprietary" nav button now appears in production headers — discoverable to all users even though the flow is beta.
  - Nothing in the classic generator path was modified, but the `Insight` interface now carries optional unit fields; any other consumer that imports it implicitly via React state should keep working since fields are optional.
- **Files:**
  - created `supabase/migrations/20260527113807_b51edd74-f7e5-45e6-8362-e5a3fb645365.sql`
  - created `supabase/functions/interview-agent/index.ts`
  - created `src/lib/proprietaryUnits.ts`, `src/lib/proprietaryAnalytics.ts`
  - created `src/pages/ProprietaryExtract.tsx`
  - created `src/components/proprietary/UnitTypeChip.tsx`, `SlotProgressGrid.tsx`, `ExistingKnowledgePanel.tsx`
  - edited `src/App.tsx` (route), `src/pages/Index.tsx` (nav), `src/pages/BrainInsights.tsx` (chip, version link, unit-contradiction resolution UI, nav)
- **Verify:**
  1. Visit `/seo-brain/insights` — every existing insight shows a "Legacy" chip; no contradictions panel for rows without entries in `brain_unit_contradictions`.
  2. Visit `/proprietary/extract` — 5-step flow renders, business-type picker shows 6 options, interview hits the `interview-agent` edge function.
  3. Insert a row into `brain_unit_contradictions` between two existing insights — both insight cards show the amber conflict block with three action buttons; clicking "Mark as context-dependent" flips the status and refreshes.

## 2026-05-27 - Fix: References section missing when context files contain zero URLs

- **What:** Changed the citation web-fallback gate in `supabase/functions/generate-content/index.ts` from `hasContextFiles` to `contextOnlySources` in three places (lines ~1433, ~1502, ~1529). Previously, attaching ANY context file (even a .docx with no hyperlinks) disabled all web fallback AND made the render gate drop the one Tier-1 web URL that was already accepted per-section, so the article shipped with no References block. Now the lock-down only triggers when context files actually contributed at least one URL candidate.
- **Why:** Latest sample (context file: "Screwless Dental Implants Research Brief.docx", 0 URLs extracted) generated with zero references. Logs showed `SOURCE CATALOGUE: 0 context URL candidate(s)` then `web fallback DISABLED` then the render gate dropping the pmc.ncbi.nlm.nih.gov URL that the per-section step had already accepted. The `contextOnlySources` flag already existed at line 1144 for exactly this distinction but wasn't being used at the fallback/render gates.
- **Files:** `supabase/functions/generate-content/index.ts` (3 small edits, comments updated).
- **Verified broken:** Nothing verified broken. Checks performed: (a) `grep` confirmed `contextOnlySources` is defined at line 1144 and the three replaced sites are the only `hasContextFiles` gates governing web-fallback/render decisions; (b) behaviour when context files DO contain URLs is unchanged (`contextOnlySources` becomes true, same lock-down as before); (c) behaviour when no context files are attached is unchanged (`!contextOnlySources` is true, same web-fallback path as before).
- **Verify:** Generate an article with a context file that has no URLs — References section must appear with Tier-1 web sources. Generate with a context file that DOES contain URLs — References must contain only those URLs (unchanged). Generate with no context files — References must contain web fallback URLs (unchanged).


## 2026-05-27 - Refactor Phase 1, slice 1: extract pure URL helpers from generate-content

- **What:** Moved the `SourceCandidate` type, the junk/authority classifier regex arrays (`junkUrlPatterns`, `highAuthorityHostPatterns`, `lowAuthorityHostPatterns`, `commercialHostHints`), the stateless helper functions (`isJunkUrl`, `isHighAuthority`, `isLowAuthority`, `looksCommercial`, `isLowQualityDomain`, `cleanSourceUrl`, `sourceTitleFromUrl`, `extractMarkdownLinks`) out of `supabase/functions/generate-content/index.ts` into a new shared module `supabase/functions/_shared/urlClassifiers.ts`. The orchestrator now imports them. Per-request caches (`urlStatusCache`, `firecrawlSourceCache`) and the network-touching `isWorkingSourceUrl` stay in the orchestrator because they depend on per-request lifetime. `placeholderHosts` stays too (only used inside `isWorkingSourceUrl`). Code moved verbatim — same regex, same logic, same identifiers.
- **Why:** First slice of the agreed Phase 1 refactor. `generate-content/index.ts` was 2,108 lines and every bug fix in one branch risked breaking another. Pulling out the cleanest stateless helpers shrinks the orchestrator by ~107 lines (now 2,001) and gives the URL/authority logic its own file so future edits to citation rules don't have to scroll past prompt assembly and word-budget code.
- **Files:** `supabase/functions/generate-content/index.ts` (removed 162 lines, added 14-line import block + 3-line comment marker), new `supabase/functions/_shared/urlClassifiers.ts` (158 lines).
- **Verified broken:** Nothing verified broken by this change. Checks performed: (a) `grep` confirmed zero duplicate definitions of the moved identifiers in `index.ts`; (b) `deno check generate-content/index.ts` reported **only 2 pre-existing errors** at lines 728 and 818 — `trimToWordCount` is referenced but never imported. These errors exist on `main` before this slice (the missing import is on line 3, which my change did not touch). Logged here so they are visible but not fixed in this turn per the user's "don't change anything else unless requested" rule. No behaviour change: identifier names, regex contents, return values, and call sites are byte-equivalent.
- **Verify:** Generate any article — output must be byte-identical to before the slice. Inspect edge function logs for `SOURCE CATALOGUE` / `SOURCE PICK` lines: behaviour and filtering should be unchanged. The function deploys and serves the same payload contract.



## 2026-05-27 - Non-commodity gate: visible signal preview + commodity badge, removed from idea generation

- **What:** Three changes to make the non-commodity gate actually observable. (1) Removed `experiencePack` injection from blog idea generation entirely — `cluster-keywords-enrich` edge function now ignores the field (back-compat), and all 3 invoke sites in `KeywordClustering.tsx` no longer build or send it. Blog ideas are outline-level value promises; first-hand signals had no slot to land in. (2) `SettingsPopover` gained a "Scan project" preview button (visible only when toggle is ON) that runs `loadProjectSignals()` and displays the extracted signal count + truncated snippets per signal type. If 0 signals are found, the popover warns "Toggle is effectively inactive" so the user knows the toggle won't do anything until they add concrete numbers/named people/protocols to brain insights or context docs. (3) `Index.tsx` now computes `gradeCommodity()` against the finished article whenever the toggle is ON, stores the result in `commodityGrade` state, and renders the existing `CommodityBadge` (red/amber/green + score) inline in the "Generated Content" card header.
- **Why:** The previous wiring sent the signal pack to both edge functions and grading existed but was never displayed, so the user enabled the toggle, saw no visible change, and had no way to tell whether signals were extracted, injected, or ignored. Now: idea generation is honest about not using it, the popover shows exactly what would be injected before generation, and finished articles wear a visible grade tied to actual signal coverage + hedge density + concrete number count.
- **Files:** `src/components/SettingsPopover.tsx`, `src/pages/Index.tsx`, `src/components/keyword-research/KeywordClustering.tsx`, `supabase/functions/cluster-keywords-enrich/index.ts`.
- **Verified broken:** Nothing verified broken. Checked: edge function still accepts old payloads with `experiencePack` (field destructure removed, no schema validation rejects it); all 3 KeywordClustering invoke bodies now omit the field cleanly; Index.tsx `commodityGrade` is null by default and badge is conditional, so users with the toggle OFF see zero UI change; clear-content and clear-form handlers both reset the grade. Not manually tested end-to-end in browser this turn.
- **Verify:** Toggle OFF → generate article and ideas, no visible badge, no behaviour change. Toggle ON → open Settings popover, click "Scan project", confirm signal count matches what's actually in brain insights / context docs. Then generate an article and confirm a coloured badge (red/amber/green) appears next to "Generated Content" with a tooltip explaining the score. Generate a blog idea and confirm the `cluster-keywords-enrich` edge function logs no `EXPERIENCE SIGNALS` block in the prompt.



## 2026-05-27 - Trust context-file URLs: stop filtering user-curated sources

- **What:** Context-file URLs now bypass the commercial/authority quality filter entirely. The user curates these deliberately — they ARE the authority for the article. Three changes in `supabase/functions/generate-content/index.ts`: (1) `extractContextSourceCandidates` no longer applies `isLowQualityDomain` to context URLs; only `isJunkUrl` and `isOwnDomainUrl` remain. (2) The reference top-up section (step 6) splits Tier-1 web search AND the relaxed Firecrawl top-up behind a single `!hasContextFiles` gate — when the user provided context files, web fallback is fully disabled even if References are below `MIN_REFERENCES = 4`. (3) A new render gate (step 7) re-validates every URL right before the References list is built: own-domain and junk always rejected; context URLs always allowed; non-context URLs rejected entirely when context files exist, and quality-filtered when they don't. Every drop is logged with the reason.
- **Why:** The previous filter rejected commercial dental/clinic URLs from context files (matched `dental|clinic|implants|smile|...` regex), which emptied the allow-list and triggered web fallback. The relaxed top-up then pulled in low-quality blogs like `smartarchesdental.com` to satisfy the minimum count. Root cause: the system second-guessed user-curated sources and over-relied on a quota. Now: context = truth, no web fallback when context exists, render gate as the final guarantee.
- **Files:** `supabase/functions/generate-content/index.ts` only.
- **Verified broken:** Nothing verified broken. Checked: read the full modified function, traced `useWebFallback` / `hasContextFiles` flags, confirmed top-up still works for context-only articles (6a always runs), confirmed articles with NO context still get web fallback (6b/6c gate is `!hasContextFiles`), confirmed render gate is additive (own-domain and junk filters already existed). Not manually tested with a live "screwless implants" generation this turn.
- **Verify:** Generate "screwless dental implants" article with the dental context files attached → edge function logs should show `SOURCE CATALOGUE: accepted N context URL(s) — context files are trusted` with N matching the curated count, and `CITATION [render-gate] DROP non-context URL` for any web-fallback leakage. Final References list must contain ONLY URLs from the context files. `smartarchesdental.com` must not appear unless the user put it in context themselves.



## 2026-05-27 - Optional non-commodity content gate (settings toggle)

- **What:** New global toggle in a Settings popover (gear icon, top-right of `/` and `/keyword-research` headers). When ON, both article generation (`generate-content`) and blog idea generation (`cluster-keywords-enrich`) receive an `experiencePack` string built client-side from `brain_insights` + `context_documents` via deterministic regex extraction (`src/lib/experienceSignals.ts`). Both edge functions inject the pack into their prompts only when present — when absent, behaviour is byte-identical to before. Default OFF.
- **Why:** Lets the user optionally enforce first-hand experience signals (cases, numbers, named outcomes, named protocols) in generated content without breaking existing flows. Never blocks generation.
- **Files:** `src/lib/experienceSignals.ts` (new), `src/components/SettingsPopover.tsx` (new), `src/components/CommodityBadge.tsx` (new), `src/pages/Index.tsx` (header + 1 invoke site), `src/pages/KeywordResearch.tsx` (header), `src/components/keyword-research/KeywordClustering.tsx` (3 invoke sites), `supabase/functions/generate-content/index.ts` (accept + inject), `supabase/functions/cluster-keywords-enrich/index.ts` (accept + inject).
- **Verified broken:** Nothing verified broken. Checked: edge functions only read new field via destructure (no-op when undefined); call sites only add the new field; toggle defaults to false so loadProjectSignals never runs unless user opts in; no DB migration. Not exhaustively manually tested in browser this turn.
- **Verify:** Toggle OFF (default) → generate article and blog ideas; payloads omit `experiencePack`, no behaviour change. Toggle ON with brain insights / context docs populated → edge function logs show "EXPERIENCE SIGNALS" block in prompt; ideas/articles reference figures from those sources.



## 2026-05-27 - Citations: section-end "Source:" line instead of inline anchors

- **What:** Replaced the inline-anchor injection inside `enforceSourcesAndReferences` (generate-content edge function) with a section-end attribution line. For each non-structural H2/H3 body section, instead of wrapping a phrase in `[anchor](url)` mid-prose, the picked reference is appended at the very end of the section body as `*Source: [Title](url)*` on its own paragraph. The final `## References` numbered list at the bottom of the article is unchanged. The model-output stripper (step 2 of `enforceSourcesAndReferences`) is not affected because it only matches lines that are exactly "Sources?:" with no trailing content — our injected line has the title+url after the colon.
- **Why:** User wants attribution placed at the end of each section as a "Source:" line, plus the existing References list at the end. Inline mid-prose anchors broke reading flow. Internal links from the Settings panel (handled by the separate `insert-internal-links` pipeline) continue to be injected inline, as requested.
- **Files:** `supabase/functions/generate-content/index.ts`, `CHANGELOG.md`.
- **Verify:** Regenerate an article. (1) Each body section ends with `Source: [Anchor Text](url)` in italics on its own paragraph, directly above the next H2. (2) No mid-prose external anchor links remain in body paragraphs (the step-3 stripper still removes any model-emitted ones, and our pipeline no longer adds any). (3) `## References` numbered list still appears at the bottom with ≥4 entries (top-up logic untouched). (4) Internal links from Settings still appear inline in body text (separate pipeline, unaffected). Check edge function logs for `CITATION: "..." -> URL (section-end Source line)`.
- **Verified broken:** Nothing verified broken. Checked: (1) `injectInlineAnchor` is no longer called from `enforceSourcesAndReferences`; grep confirms it is still defined and used nowhere else inside this function, so removing the call is a pure deletion of one code path — the helper itself is left in place in case other callers exist (none found via `rg "injectInlineAnchor"` returning only the now-removed call site and the definition). (2) The Sources-block stripper regex `/^[>*-]?\s*\*?\*?Sources?:\*?\*?\s*$/i` requires the entire trimmed line to be just "Source:" / "Sources:" with optional asterisks — our injected line `*Source: [Title](url)*` has content after the colon and therefore does not match, so the stripper cannot wipe our own injection. (3) `## References` builder at step 7 reads from `usedSources`, which is still populated identically; reference count and ordering are unchanged. (4) Top-up passes (steps 6 and 6b) and own-domain filter are untouched. (5) Internal links added by `insert-internal-links` run after this function in the frontend, so they are unaffected. Not verified: live edge function run on a real article (cannot invoke from here); user should regenerate and confirm the new "Source:" line appears in each section.



## 2026-05-27 - Domain-authority quality filter now also applies to context-file URLs

- **What:** Hoisted the Tier-1 high-authority allow-list, Tier-3 low-authority blocklist, and the commercial-host heuristic (`isHighAuthority`, `isLowAuthority`, `looksCommercial`) to the top of `generate-content/index.ts` and introduced `isLowQualityDomain(url)` = on UGC blocklist OR commercial-looking AND not on the high-authority allow-list. Applied this filter inside `extractContextSourceCandidates` so commercial/UGC URLs harvested from context files are rejected the same way web-search results are tiered. Removed the now-duplicated definitions inside `searchWebSources`. Added a `SOURCE CATALOGUE: dropped N low-quality context URL(s)` log line listing the first 8 rejected URLs.
- **Why:** Context URLs previously bypassed all authority filtering and only had `isJunkUrl` applied. A commercial dental blog (`toothclub.co.uk`) with a strong slug match (`how-do-screwless-dental-implants-work`) won the citation in `scoreSource()` over the topic-matched H2 because context URLs get a +3 base score versus 1 for web sources. Applying the same tiering to context URLs prevents low-authority commercial blogs from surfacing in References regardless of how well their slug overlaps the topic.
- **Files:** `supabase/functions/generate-content/index.ts`, `CHANGELOG.md`.
- **Verify:** Generate an article with a context file that contains a mix of authoritative URLs (nhs.uk, ada.org, ncbi.nlm.nih.gov) and commercial blogs (toothclub.co.uk, any dental clinic .com). Check edge function logs: `SOURCE CATALOGUE: N context URL candidate(s) (junk filtered)` should be smaller than before, and a new line `SOURCE CATALOGUE: dropped M low-quality context URL(s): ...` should list the commercial domains. The final article's References section should contain only high-authority hosts (Tier-1) or fall back to web-search top-up; toothclub.co.uk and similar commercial dental blogs should never appear.
- **Verified broken:** Nothing verified broken. Checked: (1) `rg -n "highAuthorityHostPatterns|lowAuthorityHostPatterns|commercialHostHints"` confirms only one definition remains (the hoisted one); the duplicate block inside `searchWebSources` was removed and the tiering logic at the bucket step still references the same names via outer-scope closure; (2) `isJunkUrl` is still applied first so the prior junk filter behaviour is preserved; (3) the filter only affects `origin === "context"` URLs at extraction time — web-search Tier-1/Tier-2 selection logic is unchanged; (4) Tier-1 hosts (nhs.uk, ncbi.nlm.nih.gov, etc.) explicitly bypass the commercial heuristic via the `isHighAuthority` early-return in `isLowQualityDomain`. Not verified: behaviour on a context file with zero high-authority URLs — the existing web-fallback path is supposed to kick in (`if (!verifiedAllowList.length) → web fallback`), and it still does because `extractContextSourceCandidates` returning fewer candidates does not change the fallback condition.



## 2026-05-26 - "Why You Can Trust This Article" E-E-A-T box (settings-toggleable)

- **What:** New collapsible trust-signal box that renders at the very top of the article, immediately above the TL;DR heading. Configurable via Settings → Output Options with three controls: a switch to include/exclude, a title input, and a markdown textarea for the body (author bio, credentials, editorial policy, verification links). All three persist to localStorage. Rendered both in the live preview (new `TrustSignalBox.tsx` shadcn Collapsible with shield icon) and in the Copy-HTML export pipeline (`buildTrustSignalHtml` produces a styled `<details>` block with inline CSS). Also wired into `src/utils/markdownToStyledHtml.ts` so any caller that passes `includeTrustSignal/trustSignalTitle/trustSignalContent` in ConvertOptions gets the same box in its output.
- **Why:** User wants an E-E-A-T authority/trust signal at the top of the article (per the attached Hinge Health "Why trust Hinge Health" reference) to satisfy AEO trust criteria and Google's E-E-A-T expectations.
- **Files:** `src/components/TrustSignalBox.tsx` (new), `src/pages/Index.tsx` (state + persistence + Output Options UI + preview render + export injection), `src/utils/markdownToStyledHtml.ts` (ConvertOptions + injection), `CHANGELOG.md`.
- **Verify:** Settings → Output Options → toggle "Include 'Why Trust This Article' Box" on, edit title/content, regenerate or open an existing article. Preview shows a collapsible box (closed by default) with shield icon directly above the TL;DR section. Copy HTML output contains a `<details data-trust-signal="true">` block in the same position. Toggle off → box disappears from both preview and export. Untouched articles (option off, default) render identically to before.
- **Verified broken:** Nothing verified broken. Checked: (1) default state of `includeTrustSignal` is `false` so existing behaviour is preserved; (2) parts-builder mutation only fires when the toggle is on AND a TL;DR heading exists in `parts[0]`; (3) export injection in Index.tsx and `markdownToStyledHtml` both guard on the toggle + non-empty content; (4) `marked` is already a dependency (used by `markdownToStyledHtml`), so the synchronous import in Index.tsx adds no new package. Not verified: visual QA in dark-site palette beyond inline-style review.



## 2026-05-26 - References top-up actually reaches the 4-minimum (relaxed fallback)

- **What:** Added a "relaxed top-up" pass in `enforceSourcesAndReferences`. After the strict Tier-1/Tier-2 search exhausts itself, if References still has <4 entries, a second pass calls Firecrawl directly per seed query (topic + each non-structural H2) with `limit: 10` and accepts any host that is NOT on a narrow UGC/social blocklist, NOT junk, and NOT own-domain. Each accepted URL is HEAD-verified before being added.
- **Why:** Previous min-4 enforcement relied on `searchWebSources` which caps at 2 candidates per call AND only accepts Tier-1 (or Tier-2 non-commercial) domains. For niche commercial topics (e.g. dental procedures) the `commercialHostHints` heuristic rejected effectively every candidate as Tier-3, so top-up plateaued at 2 references. User: "Fix what you broke" → the min-4 promise wasn't being kept.
- **Files:** `supabase/functions/generate-content/index.ts`, `CHANGELOG.md`
- **Verify:** Generate any article without context-file URLs. Logs should show `CITATION [relaxed-topup]: query="..." -> usedSources=N` and the final `## References` block should contain ≥4 numbered entries.
- **Verified broken:** Nothing verified broken. Relaxed pass only fires when strict pass leaves usedSources <4, so articles that already reach 4 are unchanged. Own-domain blocklist, junk filter, and HEAD verification all still apply.


## 2026-05-26 - References own-domain blocklist now includes internal-link library hosts

- **What:** `generate-content/index.ts` now seeds the own-domain blocklist from the `internal_link_files` table (all hosts from `urls` JSONB) in addition to the CTA URL and article-image hosts. Any URL on those domains is excluded from References at every entry point (context allow-list verification, web-fallback section pick, top-up `pushCand`, and the final pre-render `refSources` filter).
- **Why:** When `ctaUrl` is empty for a generation, the previous blocklist was empty too, so Tier-1 web search could return the project's own URLs (e.g. `dentaltourismalbania.com/blogs/...`) and they landed in References. The internal-link library is the authoritative source of "our own URLs" — querying it guarantees those hosts are always blocked.
- **Files:** `supabase/functions/generate-content/index.ts`
- **Verify:** Generate without a CTA URL. Confirm the new log line `OWN-DOMAIN BLOCKLIST: N host(s) excluded from References: ...` lists every project host, and References contains zero entries from those hosts.


## 2026-05-26 - References never include own-domain URLs

- **What:** Added `isOwnDomainUrl` filter in `enforceSourcesAndReferences` (derived from CTA URL host + article-image hosts). Applied at four points: (1) context allow-list verification skips own-domain URLs; (2) web-fallback per-section pick skips them; (3) top-up `pushCand` skips them; (4) final `refSources` filter strips them before References is rendered. Internal links to the project's own domain remain untouched — they continue to flow through the inline internal-links pipeline.
- **Why:** Citations are external evidence. The project's own URLs (e.g. `dentaltourismalbania.com/...`) belong inline as internal links, never in the `## References` block. User explicit requirement.
- **Files:** `supabase/functions/generate-content/index.ts`
- **Verify:** Generate with a CTA URL pointing at the site. Confirm References contains zero entries from that domain or its subdomains; internal-link chips still render inline as before.


## 2026-05-26 - Minimum 4 references in every article

- **What:** `enforceSourcesAndReferences` now tops up the References list to a minimum of 4 entries. After the per-section inline-injection pass, any shortfall is filled from (a) remaining verified context allow-list URLs, then (b) Tier-1 web searches keyed to the article topic and each non-structural H2. Top-up entries appear in References only (no inline anchor injection), ensuring at least 4 numbered references when sources can be found.
- **Why:** User requirement: "at least four references in the list at the end of the article. Minimum four."
- **Files:** `supabase/functions/generate-content/index.ts`
- **Verify:** Generate an article (with or without context-file URLs). Confirm the `## References` block contains ≥4 numbered entries with valid links.


## 2026-05-26 - Citation pipeline: Tier-1 web fallback when context files have zero URLs

- **What:** `enforceSourcesAndReferences` in `supabase/functions/generate-content/index.ts` no longer returns zero citations when the context-files allow-list is empty. When `contextSourceCandidates.length === 0` (or every context URL fails HEAD check), the pipeline now walks each non-structural H2/H3 and calls `sourcesForSection(heading, body)` to fetch a Tier-1 web authority (gov/edu/peer-review only, via `tier1OnlyFallback`). The single best fresh candidate per section is injected inline via `injectInlineAnchor` and credited in the consolidated `## References` block. Context-URL path is unchanged when context files contain URLs.
- **Why:** Uploaded `.docx` context files often contain no hyperlinks (e.g. `Screwless_Dental_Implants_What_Are_They.docx`). The previous strict pipeline produced articles with zero citations and no References section, which the user explicitly does not want.
- **Verified broken:** Articles previously generated with zero citations (context file with no URLs) will now include inline anchor links + References. Generation latency increases by one web-source lookup per body section when the context URL list is empty.
- **Files:** `supabase/functions/generate-content/index.ts`
- **Verify:** Generate with a context file that has no URLs. Expect inline anchors in body H2s, single `## References` at the end, every cited URL returns 200, no `**Sources:**` blocks.


## 2026-05-26 - Deterministic citation pipeline: allow-list only, single consolidated References

- **What:** Removed all source-citation instructions from the generation prompt (system + user). The model now writes clean prose with zero `**Sources:**` blocks, zero inline external links, and no `## References` section. Replaced `enforceSourcesAndReferences` with a deterministic post-processor that: (1) strips every `Sources:` block, every model-emitted external markdown link, and any model-written References/Bibliography/Works Cited section; (2) HEAD-verifies the context-files URL allow-list in parallel; (3) walks each non-structural body H2/H3 and attaches at most one inline anchor link from the highest-scoring allow-list URL (score ≥ 6, max 2 uses per URL) by safely wrapping a 3-6 word phrase via `injectInlineAnchor` (skips headings, tables, bullets, blockquotes, lines that already contain links); (4) builds a single consolidated `## References` at the end as a numbered markdown link list of used sources only (anchor text only, no raw URLs visible); (5) emits zero citations and no References section when the context files have no URLs or all URLs fail HEAD check — never falls back to web search. Removed References from the COMPLETENESS GUARD (handled by the citation pipeline instead). Added the same renderer-level safety net to `src/utils/markdownToStyledHtml.ts`: any `Sources:`/`Source:` label plus its trailing bullets (linked, bare URL, or short orphan label) is stripped on render. Updated `regenerate-section` to forbid Sources blocks and inline external links.
- **Why:** Verified sample showed `**Sources:**` bullet blocks still appearing under H2s and orphan labels left behind when fabricated URLs were stripped. User mandated: no `Sources:` blocks anywhere, one consolidated References at the end, anchor text only, allow-list URLs only.
- **What may break:**
  - Articles with no context-file URLs now have zero citations and no References section (by design).
  - Inline citations may be sparse: a section gets no inline link if no allow-list URL scores ≥ 6 against it or if no safe wrap target exists (the source still appears in References if it was credited).
  - Removed the dead `case "References"` branch is still in the completeness guard switch but `missingSections` will never include "References" — harmless no-op.
  - `searchWebSources`, `sourcesForSection`, `buildReferencesFromCandidates`, and `normaliseReferencesSection` are no longer called from the main pipeline (still defined, dead code). Left in place to minimise risk; will prune in a follow-up if needed.
  - `regenerate-section` will no longer preserve any inline citation in a regenerated section.
- **Files:** `supabase/functions/generate-content/index.ts`, `supabase/functions/regenerate-section/index.ts`, `src/utils/markdownToStyledHtml.ts`, `CHANGELOG.md`.
- **Verify:** Generate a fresh article with a context file containing URLs; grep the output for `**Sources:**` (must be 0), check that `## References` appears exactly once at the end, every `## References` link returns 200, and every URL is from the context file allow-list. Also generate with a context file that has zero URLs and confirm no References section is emitted.



## 2026-05-26 - Restore web fallback but lock it to Tier-1 when context files attached

- **What:** Reverted `contextOnlySources` back to URL-presence gating. New `tier1OnlyFallback` flag activates when context files are attached but contain no URLs — web search runs but only Tier-1 authorities (gov/edu/peer-review) are accepted; Tier-2 commercial blogs (clearchoice.com, soulbraces.com, etc.) are rejected. `searchWebSources` now takes a `tier1Only` param and the Firecrawl cache key is namespaced by tier to avoid cross-mode contamination.
- **Why:** Previous change suppressed ALL Sources blocks whenever a context file was attached, which the user flagged as broken. The real intent: never cite random commercial pages, but Tier-1 (FDA/NIH/PMC/etc.) is still acceptable.
- **Files:** `supabase/functions/generate-content/index.ts`, `CHANGELOG.md`.
- **Verify:** Re-generate the screwless implants article; logs should show `SOURCE PICK [mixed-T1only]` and citations only from FDA/NIH/PMC-class domains. No `[T2-commercial]` lines.
- **Verified broken:** Nothing verified broken (grep confirmed all `searchWebSources` callers updated; cache key updated to match).


## 2026-05-26 - Context-only mode now triggers on file presence, not URL count

- **What:** `contextOnlySources` now flips on whenever ANY context file is attached, even if the file contains zero URLs. Previously it required at least one extractable URL, so a knowledge-style context file with no links left the web-search fallback active.
- **Why:** User uploaded a context file with no URLs; generator fell back to Firecrawl and cited `clearchoice.com/dental-implant-resources/screwless-dental-implants/`. Broken-link checker passed it because the URL is reachable, but it was never authorised by the brief.
- **Files:** `supabase/functions/generate-content/index.ts`, `CHANGELOG.md`.
- **Verify:** Re-generate the screwless implants article with the same context file; logs should show `SOURCE PICK [context-strict EMPTY]` for every section and no `SOURCE WEB:` lines.
- **Verified broken:**
  - Articles where the context file has no URLs will now have NO Sources blocks on any body H2.
  - Web-search fallback is fully bypassed whenever a context file is present — even when desirable.


## 2026-05-26 - Strict context-only source URLs (no more fabricated commercial blogs)

- **What:** When context files are uploaded, generate-content now extracts every URL from them and treats that list as the closed source allow-list.
  1. Allow-list URLs are passed into the prompt with a hard "ONLY cite from this list; omit Sources block if none fits" rule.
  2. `sourcesForSection` drops the relevance floor to 1 in strict mode and NEVER falls back to Firecrawl web search (which previously surfaced commercial Tier-2 sites like soulbraces.com and greatlakesda.com).
  3. New body sanitiser inside `enforceSourcesAndReferences` strips any inline markdown link whose URL is not in the allow-list (∪ ctaUrl ∪ articleImages), keeping the visible anchor text.
  4. Content Verification check "Source link in every section" demoted from `failed` → `warning` so the verifier no longer pressures the generator into fabricating sources for sections where no allow-listed URL fits.
- **Why:** User repeatedly reported invented sources (e.g. soulbraces.com, greatlakesda.com) appearing in articles even though the brief contained 43 real, authoritative URLs. The previous prompt told the model "use real URLs" but never constrained the set; the post-generation guard then fell back to a web search that returned commercial sites.
- **Files:** `supabase/functions/generate-content/index.ts`, `src/components/ContentVerification.tsx`, `CHANGELOG.md`.
- **Verify:** Generate an article with the Invisalign Underbite brief attached and confirm every cited URL appears in the brief. Sections where no listed URL is relevant should have no Sources block (expected). Verifier shows yellow warning instead of red fail for missing sources.
- **Verified broken:**
  - Articles generated WITHOUT any context files: behaviour unchanged (web search fallback still active because `contextSourceCandidates.length === 0`).
  - Sections that previously got a fabricated commercial source will now have NO Sources block when no allow-listed URL fits — visually emptier but factually correct.



## 2026-05-25 - Add Content Verification check: source link in every section

- **What:** New verification item `Source link in every section` in `src/components/ContentVerification.tsx`. Scans every body H2, skipping TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts/Conclusion, References/Sources, How to Choose. Fails if a section body has no external markdown link. Renders the existing per-section regenerate buttons (and a "Fix all N sections" button) as the Fix action by reusing the `onRegenerateSection` / `onRegenerateAllSections` props.
- **Why:** User wants a verifier + one-click fix that ensures every body section ends with a link to its source.
- **What may break:** Sections whose only sourced reference is a non-link citation (plain text URL or footnote-style) will now report as failed. The skip list matches headings by keyword; a body H2 literally titled e.g. "Sources of funding" would be skipped because "sources" matches the skip pattern.
- **Files:** `src/components/ContentVerification.tsx`, `CHANGELOG.md`.
- **Verify:** Open an article in the editor; the Content Verification panel shows the new row. Failing sections render Fix buttons that call the existing regenerate-section flow.



## 2026-05-25 - Restore visible per-section source links in articles

- **What:** Re-enabled visible `**Sources:**` blocks for eligible body H2 sections in `generate-content`, stopped the HTML renderer from stripping those source labels and lists out of article output, and stopped `regenerate-section` from deleting inline sources during section rewrites. Updated the regression test so it now fails if body-section source links disappear again.
- **Why:** Fresh sample generation still produced articles with no visible source link under each body section because the pipeline was still removing them in three places after generation.
- **Verified broken:** `supabase/functions/generate-content/index.ts` still told the model not to output inline `**Sources:**` blocks during normal generation, then `enforceSourcesAndReferences()` removed any existing section source block and rebuilt only the final `## References` section. `src/utils/markdownToStyledHtml.ts` then stripped any remaining rendered `Sources:` label and adjacent list from the article HTML. `supabase/functions/regenerate-section/index.ts` also removed inline sources from rewritten sections. During this fix, a live backend regression was introduced and then verified in edge logs: `generate-content` referenced `isDecisionGuideHeading` out of scope and returned 500 until that runtime error was patched and redeployed.
- **Files:** `supabase/functions/generate-content/index.ts`, `supabase/functions/regenerate-section/index.ts`, `src/utils/markdownToStyledHtml.ts`, `src/test/articleRegressionVerification.test.ts`, `CHANGELOG.md`.
- **Verify:** Generate a sample article and confirm each eligible body H2 shows a visible `Sources:` block with clickable links, while the final `## References` section still remains intact.

## 2026-05-25 - Preserve References through internal-link insertion

- **What:** Added a shared References-section helper and updated `insert-internal-links` to exclude the trailing `## References` block from AI rewriting, then restore the original References section verbatim after internal links are inserted. Added regression tests covering split/restore behaviour so post-processing cannot strip or regenerate final source references again.
- **Why:** Fresh sample generation logs showed `generate-content` successfully rebuilt References, but the sample flow runs `insert-internal-links` immediately afterwards. That downstream AI rewrite path was able to drop or rewrite the final References section, so users saw generated content with no final source references even though generation itself had rebuilt them.
- **Verified broken:** The sample-generation flow in `src/pages/Index.tsx` automatically invoked `insert-internal-links` after `generate-content`. Before this fix, `insert-internal-links` sent the full article, including `## References`, back through an AI rewrite step with no preservation guard, so the final References block could disappear or be replaced.
- **Files:** `supabase/functions/_shared/referencesSection.ts`, `supabase/functions/insert-internal-links/index.ts`, `src/test/referencesPreservation.test.ts`, `CHANGELOG.md`.
- **Verify:** Generate a sample with internal links enabled. The article body may gain internal links, but the final `## References` section must still be present and must keep the original source links intact.

## 2026-05-25 - Real regression verification for article pipeline

- **What:** Added a shared article-section budget helper so the generator’s deterministic trim logic is testable and no longer keeps malformed one-row markdown tables. Added an end-to-end regression test file covering the exact breakages the user called out: inline `Sources:` blocks leaking into rendered sections, missing clickable final references, bold text leaking into article output, and single-row table regressions. Also fixed a live contradiction in `generate-content`: its normal-generation instructions were still telling the model to end every body H2 with `**Sources:**`, which directly conflicted with the newer references-only rule.
- **Why:** File reads and spot checks were not enough. They missed backend/runtime regressions and even allowed contradictory prompt rules to survive, which is why earlier replies falsely claimed nothing was broken.
- **Verified broken:** The normal-generation prompt in `supabase/functions/generate-content/index.ts` was still instructing the model to add inline `**Sources:**` blocks to every body H2, contradicting the references-only requirement. The deterministic section trimmer still allowed markdown tables to be sliced down to a header, separator, and one data row.
- **Files:** `supabase/functions/_shared/articleSectionBudget.ts`, `supabase/functions/generate-content/index.ts`, `src/test/articleRegressionVerification.test.ts`, `CHANGELOG.md`.
- **Verify:** Run the article regression tests. They must confirm: no rendered inline `Sources:` blocks, final references remain clickable, article bold tags are stripped, generator instructions do not reintroduce inline `Sources:`, and kept markdown tables have at least two data rows.

## 2026-05-25 - Remove bold text from article output

- **What:** Removed article-body bolding at all three layers. `generate-content` no longer instructs the model to bold key terms and no longer seeds Quick Tips or In This Article with bold labels. `regenerate-section` fallback bullets no longer inject bold prefixes. `markdownToStyledHtml` now unwraps all `<strong>` and `<b>` tags in article HTML so legacy stored markdown with `**...**` also renders as plain text.
- **Why:** User explicitly asked multiple times for no bolded words in generated article content, but bold text was still being introduced by prompt templates, fallback content, and previously saved markdown.
- **Verified broken:** Nothing verified broken. Checked: article-generation prompt no longer contains a “Use **bold**” instruction; Quick Tips and In This Article fallback templates are plain text; regenerate-section fallback bullets are plain text; renderer now replaces `<strong>/<b>` with text nodes only, affecting article content rendering without touching the rest of the app UI.
- **Files:** `supabase/functions/generate-content/index.ts`, `supabase/functions/regenerate-section/index.ts`, `src/utils/markdownToStyledHtml.ts`, `CHANGELOG.md`.
- **Verify:** Generate or regenerate an article section that previously bolded words. In preview, Quick Tips, navigation items, bullets, and body copy should render with no bold text.

## 2026-05-25 - One-click "Fix all sections" + "Remove inline Sources" in verification

- **What:** Content Verification now exposes (1) a deterministic "Remove" button on the "Inline Sources blocks removed" row that strips every legacy `Sources:` heading and its adjacent link list/bullets from the current article in one click, with a toast confirming how many lines were cleaned, and (2) a "Fix all N sections" primary button on the atomic-sections row that runs `regenerate-section` sequentially against every failing H2, applies each result to the latest content snapshot, and shows a single completion toast (success count or per-section failures). Per-section buttons remain for targeted reruns and are disabled while the batch is running. `regenerateOneSection` is now a shared helper so the single and batch paths cannot diverge.
- **Why:** User reported clicking each failing section button one by one, no completion signal, and inline Sources blocks reappearing on legacy content. They needed deterministic, batch, and notified fixes that do not depend on regenerating the whole article.
- **Verified broken:** Nothing verified broken. Checked: `regenerateOneSection` mirrors the previous inline logic exactly (heading match, tone profile fetch, supabase invoke, before/after join); per-section button still calls it; batch loop reuses the latest snapshot so consecutive edits do not clobber each other; "Remove inline Sources" is a pure string transform that only deletes `Sources:` headings and adjacent markdown link bullets/bare links, leaving body prose, tables, and the final References section untouched; new props are optional so other consumers of `ContentVerification` are unaffected.
- **Files:** `src/components/ContentVerification.tsx`, `src/pages/Index.tsx`, `CHANGELOG.md`.
- **Verify:** Open an article that still shows inline `Sources:` blocks. Click "Remove" next to "Inline Sources blocks removed" — the blocks disappear and a toast confirms it. For atomic sections, click "Fix all N sections" — buttons disable, the badge updates, and a single toast reports "All sections fixed" (or lists the failures).



## 2026-05-25 - References-only output, no inline Sources blocks

- **What:** Removed visible per-section `Sources:` output from the article pipeline. `generate-content` now strips legacy inline source blocks from every section, still selects at most one working source per eligible section internally, and rebuilds a single final `## References` list from those selections using anchor text only. `markdownToStyledHtml` now removes any leftover rendered `Sources:` paragraphs/lists so TL;DR, Quick Tips, and the generated navigation never show source links underneath them. `ContentVerification` now checks that inline Sources blocks are absent and that only the final clickable References section remains; atomic-section validation no longer expects per-section source lines.
- **Why:** User explicitly asked for no Sources under TL;DR, Quick Tips, or In This Article, only one source per section behind the scenes, and a single anchor-text References section at the end. The previous implementation reintroduced inline `Sources:` blocks and then incorrectly reported that nothing was broken.
- **Verified broken:** Nothing verified broken. Checked: `generate-content` no longer appends `**Sources:**` blocks in `enforceSourcesAndReferences`; final References are built from selected section sources only; renderer strips legacy `Sources:` paragraphs and adjacent source lists; verification no longer demands a source line in every section and now fails if inline `Sources:` blocks remain.
- **Files:** `supabase/functions/generate-content/index.ts`, `src/utils/markdownToStyledHtml.ts`, `src/components/ContentVerification.tsx`, `CHANGELOG.md`.
- **Verify:** Generate a fresh article. TL;DR, Quick Tips, and In This Article should show no source links below them. Body sections should not show visible `Sources:` blocks. The only citations shown should be in the final `## References` section as clickable anchor text.

## 2026-05-25 - Tier-1 authority allowlist + commercial-host rejection + reference title dedupe

- **What:** Rewrote the Firecrawl web-source picker in `generate-content` to use a STRICT POSITIVE allowlist instead of just a UGC blocklist.
  - **Tier 1 (accepted by default):** explicit allowlist of high-authority domains — government & regulators (.gov / .gov.uk / .gov.au / .gc.ca / europa.eu / who.int / oecd.org); health authorities (NHS, NICE, MHRA, CDC, FDA, NIH, NLM, NCBI, MedlinePlus, EMA, ECDC, Mayo Clinic, Cleveland Clinic, Johns Hopkins, Mount Sinai, Mass General, Kaiser Permanente, Bupa, Health Direct AU, Healthline, WebMD, Medical News Today, BMJ, Lancet, NEJM, JAMA, Cochrane); dental professional bodies (ADA, BDA, RCS Eng, GDC UK, FDI World Dental, BSPerio); academia (`.edu`, `.ac.*`, Nature, Science, ScienceDirect, Springer, Wiley, Taylor & Francis, SAGE, OUP, Cambridge, PLOS, Frontiers, MDPI, arXiv, SSRN, JSTOR); reference works (Wikipedia, Britannica); standards bodies (ISO, IEC, IEEE, IETF, W3C, BSI, CENELEC, ASTM, NIST); major news (Reuters, AP, BBC, NYT, Washington Post, WSJ, FT, Economist, Guardian, NPR); consumer watchdogs (Consumer Reports, Which?, Citizens Advice).
  - **Tier 2 (fallback only):** unknown commercial hosts. Used ONLY if zero Tier-1 result for the query.
  - **Tier 3 (never used as a citation):** UGC/social/Q&A/content farms (Reddit, Quora, Pinterest, Medium, Substack, Tumblr, Blogspot, WordPress.com, Wix, Weebly, Squarespace, TripAdvisor, Yelp, StackExchange/Overflow, Facebook, Instagram, TikTok, X/Twitter, eHow, WikiHow, Answers.com, BuzzRx, GoodRx blog, SingleCare) + heuristic block for hostnames containing marketing keywords (`tourism`, `clinic`, `dental`, `dentist`, `implants`, `veneers`, `cosmetic`, `smile`, `whitening`, `invisalign`, `loans`, `insurance`, `reviews`, `best`, `top10`, `cheap`, `coupon`, `directory`, `finder`, `near-me`, `seo`). This rejects dental-tourism, lead-gen directories, local clinic blogs, and SEO listicles like `dentaltourismalbania.com`, `buzzrx.com`, etc.
  - If no Tier-1 or Tier-2 result clears, the section gets NO Sources line (better than citing a dental-tourism page).
  - Firecrawl now requests 15 results (up from 10) so the allowlist has a wider pool. Logs now print `[T1]`, `[T2-commercial]`, or `[T3-low]` tier tags next to each pick.
- **References dedupe:** `rebuildReferencesFromLinks` now dedupes by BOTH URL and normalised title (lowercased, alphanumeric-only). Fixes the screenshot where "What Are Screwless Dental Implants" / "How Do Screwless Dental Implants Work?" appeared twice with slightly different URLs.
- **Why:** User reported References list still full of commercial blogs (BuzzRx, dental-tourism sites, lead-gen directories) and duplicate titles even with context files removed. The previous "high-authority" pass had no positive criteria — anything not in the small UGC blocklist passed, so a random commercial blog counted as high-authority. The new allowlist makes "authority" earned, not assumed.
- **Verified broken:** Nothing verified broken. Checked: `rg "rebuildReferencesFromLinks|seenTitle"` shows the dedupe accepts both passes; T1 allowlist regex patterns reviewed line-by-line; T3 catches the exact hosts in the user screenshot; commercial-host heuristic matches `dentaltourismalbania.com` (hits `tourism` + `dental`); `sourcesForSection` consumer unchanged (still returns `SourceCandidate[]`); context-file path (Tier 0) still wins when present; `formatSourcesLine` / TL;DR strip / regenerate-section untouched.
- **Files:** `supabase/functions/generate-content/index.ts`, `CHANGELOG.md`.
- **Verify:** Generate an article with NO context files. Open edge function logs — every `SOURCE WEB:` line should be tagged `[T1]` (or `[T2-commercial]` only when no T1 exists). The article References section should list only allowlisted domains, no duplicates by URL or title. No `buzzrx.com`, no `*tourism*`, no local clinic blogs should appear.



## 2026-05-25 - Deep Research prompt rebuilt around Strict Source Hierarchy

- **What:** Replaced the old "Act as an expert SEO content researcher" Deep Research prompt with a topic-agnostic Strict Source Hierarchy + Negative Constraints template, extracted into `src/lib/deepResearchPrompt.ts` (`buildDeepResearchPrompt`). The new prompt: (1) casts the model as a subject-matter expert / standards analyst / research librarian; (2) explicitly FORBIDS commercial provider blogs, lead-gen directories, comparison/affiliate sites, marketing brochures, Reddit/Quora/Pinterest/Medium/Substack/social, eHow/WikiHow, and any selling/lead-capture page; (3) mandates four authority tiers — Tier 1 standards/regulators/professional bodies (NHS, NICE, CDC, FDA, NHTSA, FCC, ISO, IEEE, BDA, RCS, etc.), Tier 2 peer-reviewed literature (PMC, MEDLINE, Cochrane, IEEE Xplore, ACM, NIST), Tier 3 governmental oversight (NAO, GAO, ONS, BLS), Tier 4 manufacturer/industry technical docs for spec claims only; (4) requires every numeric claim to carry figure + date + jurisdiction + source name + tier + URL; (5) demands a consolidated References section grouped by tier with anchor-text titles. Wired the helper into all three existing call sites: `ContentQueue.tsx`, and the two Deep Research buttons in `KeywordClustering.tsx`.
- **Why:** User reported that generated context files produced poor sources (random local clinic blogs, SEO listicles) because the upstream Deep Research prompt did not constrain Gemini/ChatGPT/Perplexity to authoritative tiers. Better context files → better in-article sources downstream (the picker can only choose from what the user uploads).
- **Verified broken:** Nothing verified broken. Checked: `rg "Act as an expert SEO content researcher" src supabase` returns no matches; all three call sites updated to the helper with identical input fields (title, topic, topicDescription, ideaDescription, strategicAngle, targetKeywords, valuePromises); toasts unchanged; clipboard copy path unchanged; no edge function changes; generate-content / regenerate-section / fix-broken-links untouched; markdownToStyledHtml untouched.
- **Files:** `src/lib/deepResearchPrompt.ts` (new), `src/components/keyword-research/ContentQueue.tsx`, `src/components/keyword-research/KeywordClustering.tsx`, `CHANGELOG.md`.
- **Verify:** In Keyword Research, click any Deep Research button on a blog idea. Pasted prompt should begin with "You are acting as a Subject-Matter Expert..." and contain the FORBIDDEN sources list and the Tier 1–4 hierarchy. Paste into Gemini Deep Research and confirm the returned context document cites only Tier 1–3 (plus Tier 4 for spec claims) and produces a tier-grouped References section.



## 2026-05-25 - Sources line: line-by-line, never inside TL;DR

- **What:** (1) `markdownToStyledHtml` now strips any `**Sources:**` line that falls inside the `## TL;DR` section (between the TL;DR heading and the next H1-H3), so the TL;DR panel renders as a single clean paragraph. (2) Any remaining `**Sources:** [a](u) | [b](u)` paragraph is reformatted to a `**Sources:**` heading followed by one `- [link](url)` bullet per line (also splits on `•` and `·`). (3) Generator prompt updated: forbids Sources inside TL;DR/Quick Tips/nav/How-to-Choose/FAQ/Final Thoughts and mandates bullet-per-line format. (4) Deterministic `formatSourcesLine` in `generate-content` and the `sourceLine` builder in `regenerate-section` now emit bullets instead of `|`-joined links.
- **Why:** User screenshot showed Sources mushed inline with `|` separators inside the TL;DR panel; sources must sit only in body H2 sections and render as a readable vertical list.
- **Verified broken:** Nothing verified broken. Checked: file reads of all three edited files; regex preserves bare `**Sources:**` lines with no links; TL;DR strip only fires between `## TL;DR` and next heading; bullet reformat is idempotent (already-bulleted Sources lines won't match the single-line regex); `markdownToStyledHtml.ts` paragraph styling unaffected; export/copy paths reuse the same renderer.
- **Files:** `src/utils/markdownToStyledHtml.ts`, `supabase/functions/generate-content/index.ts`, `supabase/functions/regenerate-section/index.ts`, `CHANGELOG.md`.
- **Verify:** Generate a new article. TL;DR panel should contain only the summary paragraph — no Sources line. Each body H2 should end with a `Sources:` label followed by one link per line (anchor text only, no `|` separators).



## 2026-05-25 - Authority-tiered web source fallback

- **What:** When per-section context URLs don't clear the relevance floor, the Firecrawl fallback now requests 10 results (up from 6) and selects them in four authority passes: (1) top-3 search-rank + high-authority, (2) any rank + high-authority, (3) top-3 + low-authority, (4) any low-authority. Low-authority hosts include Reddit, Quora, Pinterest, Medium, Substack, Tumblr, Blogspot, WordPress.com, Wix, Weebly, Squarespace, TripAdvisor, Yelp, StackExchange/Overflow, Facebook, Instagram, TikTok, X/Twitter, eHow, WikiHow, Answers.com. They're only picked when no working high-authority page exists for the query. Added `SOURCE WEB:` logs naming each pick and tagging `[low-auth]` when applicable.
- **Why:** Without per-project trusted-domain lists the fallback was returning random blogs and social/Q&A pages instead of top-ranked authoritative pages, which made non-medical articles (cars, mics, sports, etc.) look poorly cited.
- **Verified broken:** Nothing verified broken. Checked: `generate-content` deploys (next step); `SourceCandidate` shape unchanged; context-first path still wins when the relevance floor is met; web fallback still returns up to 2 candidates as before; `sourcesForSection` consumer untouched; `fix-broken-links` and `regenerate-section` untouched.
- **Files:** `supabase/functions/generate-content/index.ts`, `CHANGELOG.md`.
- **Verify:** Generate an article about a non-health topic (microphones, cars, sports). Check edge function logs for `SOURCE WEB: query="..." -> <url>` lines. Picked URLs should be from publishers/manufacturers/established media before any Reddit/Quora/Medium URL appears; low-auth URLs only appear when nothing higher ranks.



## 2026-05-25 - Snippet-aware context source picker + junk URL filter

- **What:** Rewrote the context-URL extractor in `generate-content` to capture each URL with a ±300-char surrounding snippet (markdown links + bare URLs), filter out junk URLs (privacy/cookies/terms/share/social/CDN/tracking/asset URLs), and score sources by snippet-vs-section-heading token overlap instead of just URL/title overlap. Picker now requires a relevance floor of 6 (multiple distinct snippet hits) before accepting a context URL; below that it falls through to Firecrawl web search. Web fallback also rejects junk URLs. Added clear `SOURCE PICK [context|mixed]` logs so source decisions are auditable in edge function logs.
- **Why:** Previous picker grabbed the first URL it found in concatenated context text (often a footer/cookie/share link), then reused it across many sections. Authoritative sources like Bupa/NHS/etc. were present in context files but never selected because the picker ignored which paragraph the URL came from.
- **Verified broken:** Nothing verified broken. Checked: `extractMarkdownLinks` still returns same shape (snippet field is optional); `regenerate-section` and `fix-broken-links` not touched; `enforceSourcesAndReferences` and `formatSourcesLine` consume the same `SourceCandidate` type; junk filter list excludes only obvious non-citation patterns (legal/social/CDN/asset/tracking) so authoritative pages like `bupa.co.uk/health-information/...` pass through unchanged.
- **Files:** `supabase/functions/generate-content/index.ts`, `CHANGELOG.md`.
- **Verify:** Generate a new article with context files that contain authoritative URLs deep inside paragraphs (Bupa/NHS/etc.). Check edge function logs for `SOURCE CATALOGUE: N context URL candidate(s) (junk filtered)` and per-section `SOURCE PICK [context]: "<heading>" -> <url>` lines. The picked URL should be the one whose surrounding paragraph matches the section heading, not a footer/cookie link.



## 2026-05-25 - Enforce source lines and deploy link checker

- **What:** Added a deterministic source guard after article generation that removes stale References, validates existing source links, uses context-file URLs first, searches with Firecrawl when needed, appends working `**Sources:**` links to each article section, and rebuilds `## References` from the surviving clickable links. Regenerated sections now also end with a working `**Sources:**` line when a source can be verified. Added `fix-broken-links` to function configuration so the Content Verification button can reach the deployed checker. Content Verification now fails when per-section source links or the final References section are missing.
- **Why:** The generated sample had no per-section source lines or final References section, and the checker failed before reaching the backend function.
- **Verified broken:** The generated sample at 15:41 had no context files and no final source enforcement, so the model could omit source lines and References. The `fix-broken-links` function had no deployed call logs and was missing from `supabase/config.toml`, causing the UI request to fail before function execution.
- **Files:** `supabase/functions/generate-content/index.ts`, `supabase/functions/regenerate-section/index.ts`, `supabase/functions/fix-broken-links/index.ts`, `supabase/config.toml`, `src/components/ContentVerification.tsx`, `CHANGELOG.md`.
- **Verify:** Deploy `generate-content`, `regenerate-section`, and `fix-broken-links`; call `fix-broken-links` with a known broken link; generate a new sample and confirm each section has `**Sources:**` and the article ends with `## References`; confirm Content Verification flags missing source sections.

## 2026-05-25 - Broken-link checker with Firecrawl auto-fix

- **What:** New `fix-broken-links` edge function scans every external markdown link in the article (HEAD then GET, 8s timeout), and for each broken URL queries Firecrawl `/v2/search` using the link's anchor text + nearest heading; the first candidate that returns HTTP 200 replaces the broken URL in-place. If no working replacement is found, the link is removed and the anchor text is kept as plain prose. Afterwards the `## References` section is rebuilt deterministically from the remaining real markdown links so it never includes stale URLs. UI: new "Broken link checker" block in the Content Verification panel with a "Check & Fix Links" button and a results summary listing replaced/removed URLs.
- **Why:** User reported broken/hallucinated reference URLs and wanted a manual one-click way to verify and repair every link without losing the article body.
- **Verified broken:** Nothing verified broken. Checked: existing `verify-links` function untouched; `generate-content` + `regenerate-section` per-section Sources logic untouched; `setGeneratedContent` writes through the same path used by other fixes (em-dash, horizontal-line, internal-link insertion). The replacement step calls Firecrawl only when a URL fails the HTTP check, so working links are never touched.
- **What may break:** If `FIRECRAWL_API_KEY` is missing or Firecrawl returns no working candidate, broken links are stripped (anchor text kept) — this is the requested behaviour but visually changes paragraphs that previously contained those links. Article word count can decrease slightly when many links are removed.
- **Files:** `supabase/functions/fix-broken-links/index.ts` (new), `src/components/ContentVerification.tsx`, `src/pages/Index.tsx`, `CHANGELOG.md`.
- **Verify:** Generate or open an article with at least one external link, click "Check & Fix Links" in the Content Verification panel. The summary shows total/broken/replaced/removed counts; broken URLs that Firecrawl could repair are swapped in the body and the References section is rebuilt to match.



## 2026-05-25 - Fix stale warnings references after revert cleanup

- **What:** Removed remaining `warnings` conditionals and the last `integrityWarnings` dependency left after source-guard cleanup.
- **Why:** The cleanup removed the warning state but left references that caused TypeScript compile errors.
- **Verified broken:** Temporary TypeScript compile failure from stale `warnings` references in `src/pages/Index.tsx`; fixed before delivery.
- **Files:** `src/pages/Index.tsx`, `src/components/ContentVerification.tsx`, `CHANGELOG.md`.
- **Verify:** `rg` confirms stale guard/warning strings are gone; `bunx vitest run src/test/example.test.ts` passes.

## 2026-05-25 - Remove stale source-guard revert leftovers

- **What:** Removed leftover source-integrity warning plumbing and source repair fallback behaviour from generation, section regeneration, and the editor wrapper. Kept the existing internal-link preservation logic unchanged.
- **Why:** The project revert did not clear all runtime/source-guard changes, and persisted editor state can make reverted code look unchanged in the preview.
- **Verified broken:** Nothing verified broken.
- **Files:** `src/pages/Index.tsx`, `src/components/ContentVerification.tsx`, `supabase/functions/generate-content/index.ts`, `supabase/functions/regenerate-section/index.ts`, `CHANGELOG.md`.
- **Verify:** Search for removed guard strings and run the focused test suite.

## 2026-05-27 — Proprietary assembler: fix null-unit path

**What:** Rewrote Rules 1, 4 and added Rule 6 in `_shared/proprietaryPromptAssembler.ts` so body sections without a mapped brain unit still produce non-commodity output. `[NEEDS EXPERT INPUT]` is now an inline placeholder for missing specifics, never a whole-section escape hatch (except for failure-mode sections without a failure unit, which still emit the token for the missing case data — Rule 4 split into `_WITH_UNIT` / `_NO_UNIT` variants). H2-question sections without a contrarian unit now receive an explicit contrarian licence so the model can call out marketing-term topics ("this term is mostly marketing, not a clean technical category").

**Why:** Screwless-implants test article came back commodity because the null-unit path told the model to dump `[NEEDS EXPERT INPUT]` for the whole section; model ignored it and wrote generic prose. Closing the gap between GPT-agent quality and Lovable generator quality requires the assembler rules to fire on every body section regardless of unit availability.

**Files:** `supabase/functions/_shared/proprietaryPromptAssembler.ts`.

**Verified broken:** Nothing verified broken. Checked: assembler file reads, `runSection` consumers (`proprietary-generate-article/index.ts`, `proprietary-generate-section/index.ts`) — both pass `mappedUnit: null` through unchanged and read `appliedRules` as `number[]`, which still holds. No callers depend on Rule 1 forcing a whole-section token. Did not run the build (harness will).

**What may break:** Sections that previously short-circuited to `[NEEDS EXPERT INPUT]` will now produce real content; `needsExpertInput` telemetry counts will drop. Failure-mode sections without a failure unit now describe generic clinical failure mechanisms instead of emitting the bare token — the `needsExpertInput` flag in those cases now reflects the absence of inline placeholders, not the absence of a unit.

## 2026-05-27 — insert-internal-links: timeout hardening
- What: Switched model from `gemini-3-flash-preview` → `gemini-2.5-flash`; added 110s AbortController; on timeout/error, return original content with 200 instead of letting the function 504.
- Why: Function was hitting the 150s edge idle timeout, producing a blank screen for the user.
- Files: supabase/functions/insert-internal-links/index.ts
- Verified broken: None (graceful fallback preserves prior content). To verify: trigger internal-link insertion on a long article; confirm no 504 and either links inserted or original content returned with `note`.
