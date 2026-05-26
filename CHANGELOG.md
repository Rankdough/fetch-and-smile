# Changelog

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
