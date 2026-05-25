# Changelog

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
