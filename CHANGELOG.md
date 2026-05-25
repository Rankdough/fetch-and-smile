# Changelog

Every entry must list: **What changed**, **Why**, **What may break / side effects**, **Files touched**, **How to verify**.
Newest entries on top. Append-only — never edit or delete past entries.

## 2026-05-25 — Fix: generate-content also leaking OOXML namespace URLs into Sources/References

**What changed:** `supabase/functions/generate-content/index.ts` `addContextSourceLink` now rejects any URL whose host matches `schemas.openxmlformats.org`, `schemas.microsoft.com`, `purl.oclc.org`, `www.w3.org`, `schemas.xmlsoap.org`. Same blocklist as the parse-context-file fix.

**Why:** The earlier parse-context-file fix cleaned the catalogue header but `generate-content` independently re-scans the raw context file `content` for URLs (line ~133, `content.matchAll(/https?:\/\/[^\s)\]>"']+/g)`). Any namespace URLs that were already inside cached/parsed context (e.g. articles parsed before the previous fix) were still being added to `contextSourceLinks`, surviving link-check (HEAD usually returns 200/3xx for those hosts), and showing up as "broken context source URLs" in the SOURCE GUARD warning. User screenshot confirmed 8 `http://schemas.microsoft.com/office/word/2010/wordproc...` URLs in the generation integrity warning.

**Verified broken:** Nothing. Only `addContextSourceLink` was edited — added a single early-return guard. Real URLs (pubmed, bicon, aspendental, etc.) are unaffected because their hosts don't match the regex. No call-site changes.

**Files touched:** `supabase/functions/generate-content/index.ts`, `CHANGELOG.md`.

**How to verify:** Regenerate the article with the same context files. The SOURCE CATALOGUE log line should show real source counts (not inflated by schema URLs), and the integrity warning should no longer list `http://schemas.*` URLs as "broken context source URL(s)".



## 2026-05-25 — Fix: References section showing OOXML namespace URLs instead of real hyperlinks

**What changed:** `supabase/functions/parse-context-file/index.ts` source-catalogue extractor now (1) excludes OOXML namespace hosts (`schemas.openxmlformats.org`, `schemas.microsoft.com`, etc.) from both relationship targets and the fallback URL scan, (2) runs the fallback inline-URL regex against the **extracted paragraph text** instead of raw `document.xml` (raw XML contains namespace declarations that were being treated as citable sources), and (3) adds an unreferenced-relationship pass so external rels not inline in `<w:hyperlink>` still flow through. Catalogue header now explicitly instructs the LLM to use ONLY these URLs.

**Why:** User uploaded `Screwless_Dental_Implants_Research_Brief-2.docx` (39 valid hyperlinks). The generated article's References section listed only `http://schemas.openxmlformats.org/...` URLs because the fallback regex was matching `xmlns:w="http://schemas..."` attribute values from the raw XML and the LLM surfaced those instead of the real sources.

**Verified broken:** Nothing. Re-ran the new extractor logic against the user's uploaded brief in a Node script: 39 unique sources extracted, 0 namespace URLs leaked, first/last entries match the document's Works Cited list exactly. No other callers of `extractDocxSourceCatalogue` exist (function is local to this file).

**Files touched:** `supabase/functions/parse-context-file/index.ts`, `CHANGELOG.md`.

**How to verify:** Re-upload the brief, regenerate the article, confirm References section shows pubmed/bicon/aspendental URLs (not openxmlformats schema URLs).


---

## 2026-05-25 — Force source links on every body section

**What changed**
- `generate-content` now runs a deterministic source-line guard after AI generation: every body H2 section gets a clickable `**Sources:**` line when context-file URLs are available and sources are not skipped.
- Existing broken or non-clickable source lines are replaced with a clickable URL from the verified context source catalogue.
- The final `## References` section is still rebuilt from the source lines actually present in the article, falling back to the verified context catalogue if needed.
- New main-generator uploads now retain the uploaded storage path in local state so future debugging and source recovery can identify the original context file, while preserving the existing `name` + `content` shape.

**Why**
- The model was still allowed to omit per-section source lines when it decided no catalogue URL supported a section. That made sources probabilistic instead of guaranteed, even when context files contained links.
- Recent logs showed the generated sample used stale 10,000-character context snippets with `SOURCE CATALOGUE: 0 accepted, 0 rejected`, so no final references could be built from that run. Newly uploaded files parse to 30,000 characters, but the generator also now forces source lines whenever any catalogue URLs are present.

**Verified broken**
- Nothing verified broken. Checked: code search showed the sample reached `generate-content` with three 10,000-character context files and zero accepted URLs; patched only `generate-content/index.ts` source enforcement and `Index.tsx` context-file metadata. Existing `name` and `content` fields are unchanged, and reference rebuilding still uses only allowed context URLs.

**Files touched**
- `supabase/functions/generate-content/index.ts`
- `src/pages/Index.tsx`

**How to verify**
- Re-upload the context DOCX files, generate a new article with sources enabled, then confirm edge logs show `SOURCE CATALOGUE: N accepted` with `N > 0` and the output contains `**Sources:** [..](..)` after every body H2 plus a final `## References` section.

---

## 2026-05-25 — Diagnostic log for source catalogue extraction

**What changed**
- `generate-content` now logs `SOURCE CATALOGUE: N accepted, M rejected. contextFiles=… First 5 accepted: … First 5 rejected: …` immediately after URL extraction + verification, so we can see exactly why References/links are missing from a generated article (zero URLs extracted vs. all rejected by the link checker vs. context file content empty).

**Why**
- A generation ran with a DOCX brief containing many URLs and produced no References/inline links. Logs gave no visibility into whether `contextSourceLinks` was empty after extraction, after verification, or whether `contextFiles` arrived empty at the function. Cannot fix what we cannot see.

**Verified broken**
- Nothing. Checked: only added a single `console.log` line inside `generate-content/index.ts` between existing statements. No control flow, no variables, no exports, no other functions touched. The line uses only variables already in scope (`contextSourceLinks`, `rejectedContextSourceUrls`, `contextFiles`).

**Files touched**
- `supabase/functions/generate-content/index.ts` (1 added log line at line ~150)

**How to verify**
- Generate an article with the same DOCX brief. Open `edge-function-logs-generate-content` and read the `SOURCE CATALOGUE:` line. Report the numbers — that tells us exactly where the pipeline drops the URLs.

---

## 2026-05-25 — Extract DOCX hyperlink sources from context files

**What changed**
- `parse-context-file` now reads `word/_rels/document.xml.rels` from uploaded `.docx` files and builds a source URL catalogue from embedded Word hyperlinks, not just visible text.
- Parsed DOCX context now prepends `SOURCE URL CATALOGUE FROM UPLOADED CONTEXT FILE` before the article text so `generate-content` can detect those URLs as allowed source/reference links.
- The context parse limit increased from 10,000 to 30,000 characters so long research briefs keep the source catalogue plus enough body context.
- The main article generator upload toast now reports the new 30k truncation limit.

**Why**
- The uploaded research brief contained many URLs stored as DOCX relationships and/or late Works Cited entries. The old parser only extracted `<w:t>` text and then truncated to 10k characters, so embedded hyperlinks and later reference URLs were not reliably reaching generation.

**What may break / side effects**
- Larger context payloads can increase generation prompt size and cost slightly.
- If a DOCX contains many unrelated hyperlinks, all extracted URLs become eligible catalogue sources unless the content generator later filters them by relevance.
- The parser is still XML-based and does not preserve every Word layout detail; it is specifically improved for text plus hyperlink extraction.

**Files touched**
- `supabase/functions/parse-context-file/index.ts`
- `src/pages/Index.tsx`

**How to verify**
- Upload `Screwless_Dental_Implants_Research_Brief.docx`. The parsed context should start with a source catalogue and expose at least 39 URLs from the file before truncation. Generate with sources enabled and confirm the final References section uses those context-file URLs.

---

## 2026-05-25 — Preserve references and source links in export

**What changed**
- `generate-content` now deterministically restores a `## References` section whenever context-file source URLs exist and sources are not skipped. It first uses URLs cited in `**Sources:**` lines, then falls back to the verified context source catalogue if the model omitted citations.
- The Shopify bulk export whitelist now preserves links inside `**Sources:**` lines and the final `## References` section instead of unwrapping them because they were not entered in the internal-link fields.
- New Shopify bulk sessions now include sources by default, and uploading a context file automatically turns off `Skip References / Sources` so references are not silently disabled.

**Why**
- Source/reference URLs were still disappearing after generation. The backend could end with no rebuilt References block if the model omitted source lines, and the export page then stripped citation links because its final whitelist only allowed internal links.

**What may break / side effects**
- If context files contain many URLs, the fallback References section can include more links than the article body actually cited. This is intentional until there is a stronger citation matcher.
- Source/reference links are preserved only when they appear in a `**Sources:**` line or under a References/Sources H2. Links elsewhere still must match the internal-link whitelist or they are unwrapped.
- A context URL that passed the lenient verifier but is paywalled, geoblocked, or bot-blocked can still appear in References.
- Existing browser-local settings may still have `Skip References / Sources` enabled from an earlier session until a context file is uploaded or the checkbox is manually changed.

**Files touched**
- `supabase/functions/generate-content/index.ts`
- `src/pages/ShopifyFaqBulk.tsx`

**How to verify**
- Generate/export an article with context files containing source URLs and Skip References/Sources disabled. Confirm the markdown and Body HTML include a `References` section with clickable links, and that provided internal links still inject separately.

---

## 2026-05-25 — No back-to-back tables

**What changed**
- TABLE GUARD in `generate-content` now only injects fallback tables into body H2 sections that **do not already contain a table**. If every eligible section already has one, injection is skipped entirely (warning logged) rather than producing duplicates.
- Added a final `removeAdjacentTables` pass that scans the finished markdown and deletes the second of any two tables separated only by blank lines.
- Prompt now explicitly forbids placing two tables back-to-back; if two comparisons belong together they must be merged into one wider table.

**Why**
- User saw a real comparison table immediately followed by the generic "Aspect / Option A / B / C" fallback. TABLE GUARD was blindly counting tables and adding more to hit the cadence target, with no check for adjacency.

**What may break / side effects**
- If the model writes one real table and the article still needs more, TABLE GUARD will now skip injection in any H2 that already has a table. Total table count can therefore fall short of `requiredTables` when most body sections already contain a table. This is a deliberate trade-off: the back-to-back rule wins over the cadence rule.
- `removeAdjacentTables` runs after injection, so a model-produced pair of adjacent tables will also be collapsed (second one removed). If the model intentionally puts two related tables next to each other, the second is lost — the prompt now tells it to merge instead.
- Detection requires standard markdown pipe syntax with a `| --- |` separator. Tables written as HTML `<table>` (already forbidden by the prompt) are not detected.
- `regenerate-section` does not run this pass — regenerating a single section adjacent to an existing table could re-introduce adjacency until that function is updated.

**Files touched**
- `supabase/functions/generate-content/index.ts` (prompt line ~335, TABLE GUARD ~1383–1470)

**How to verify**
- Generate a 1,500-word article. Search the output markdown for the pattern of one table's last `|...|` row followed (after blank lines only) by another `|...|` header row + `| --- |` separator. Should not occur. Check logs for `TABLE GUARD: Removed N back-to-back duplicate table(s)` or `No table-free body H2 sections available; skipping injection`.

---

## 2026-05-25 — Strip single-row tables

**What changed**
- Added `stripUndersizedTables` pass in `generate-content` that removes any markdown table with fewer than 2 data rows before TABLE GUARD counts tables.
- Prompt now explicitly forbids producing a table with only one data row; the model is told to use a sentence or bullet instead.

**Why**
- User rule: one-row tables aren't real comparisons and should never appear in articles.

**What may break / side effects**
- A removed undersized table reduces the table count, so TABLE GUARD may then inject a generic fallback table (Aspect / Option A / B / C) to hit the cadence. That fallback can read as boilerplate on niche topics.
- The strip only runs in normal generation, not in `expandExistingContent` mode — existing 1-row tables in expand-mode passes won't be touched.
- Detection requires a proper separator row (`| --- | --- |`). Malformed tables without a separator are not recognised as tables and pass through untouched (same as before).
- `regenerate-section` does not yet run this strip; regenerating a single section can still produce a 1-row table until that function is updated.

**Files touched**
- `supabase/functions/generate-content/index.ts` (lines ~325–337 prompt rule, ~1325–1380 strip + guard)

**How to verify**
- Generate an article and check that no markdown block has the shape `| H1 | H2 |\n| --- | --- |\n| only | row |` followed immediately by a blank line or new heading. Check edge function logs for `TABLE GUARD: Removed N undersized table(s)`.

---

## 2026-05-25 — Lenient context-URL verifier (refs were disappearing)

**What changed**
- `checkSourceUrl` in `generate-content` and `regenerate-section` now only rejects URLs that return **404 / 410** or are syntactically invalid / placeholder hosts. 403, 405, 429, 5xx, timeouts, and network errors are now **trusted** (the URL came from the user's own context file).

**Why**
- ScienceDirect, NHS, journal PDFs, and many publishers block bot HEAD/GET requests with 403/405/timeout. The previous strict check dropped them all, the catalogue went empty, and the prompt then told the model to omit every `**Sources:**` line and the `## References` section entirely. Result: articles came back with zero references.

**What may break / side effects**
- A genuinely dead URL that returns a soft-404 with HTTP 200 will now slip through. Mitigation: still surfaced as `contentIntegrityWarnings` if it later fails post-strip.
- A URL that 403s for the bot **but also 403s for real users** will be kept in the catalogue. The visible References list could contain a link the reader can't open.
- Hard-removal of broken links is now narrower; the article may include URLs that are paywalled or geoblocked.

**Files touched**
- `supabase/functions/generate-content/index.ts` (lines ~80–113)
- `supabase/functions/regenerate-section/index.ts` (lines ~82–110)

**How to verify**
- Generate an article with a context file containing a ScienceDirect or NHS URL. Confirm the `## References` section is present and the URL appears as a clickable markdown link. Check edge function logs for `SOURCE GUARD` warnings.

---

## 2026-05-25 — Table cadence raised to 1 per 500 words

**What changed**
- `requiredTables = Math.max(1, Math.floor(targetWords / 500))` (was `/ 600`).
- Prompt wording updated: "AT LEAST N tables" instead of "EXACTLY N".
- Explicit thresholds called out: ≥2 tables for 1,000 words, ≥3 tables for 1,500 words.

**Why**
- User rule: a 1,000-word article needs at least 2 tables; a 1,500-word article needs at least 3.

**What may break / side effects**
- TABLE GUARD will inject more fallback tables when the model under-delivers, which can feel formulaic on short articles.
- Per-section word budgets are unchanged, so each table competes for the same body word count — sections containing tables may have slightly shorter prose.
- Migration mode is unaffected (still capped at 1 table).

**Files touched**
- `supabase/functions/generate-content/index.ts` (lines ~197–199, ~315–316, ~593)
- `mem://style/table-generation-frequency`
- `mem://index.md` (Core → Formatting rule)

**How to verify**
- Generate a 1,000-word article → expect ≥2 markdown tables. Generate a 1,500-word article → expect ≥3. Each table ≥3 columns, ≥4 data rows, spread across body H2s.

---

## 2026-05-25 — Auto-reparse stale cached context files
- What: On Index mount, any cached context file whose content lacks the "SOURCE URL CATALOGUE" header and has a filePath is re-parsed via parse-context-file.
- Why: Previously-uploaded .docx files saved in localStorage were capped at 10000 chars (no source catalogue, real reference URLs truncated away), causing generated articles to have empty References sections. New uploads work; cached ones were stuck.
- Files: src/pages/Index.tsx
- Verify: Reload Index with stale files in localStorage; toast "Context file refreshed" appears and next generation logs SOURCE CATALOGUE > 0 accepted.
- May break: Verified broken: nothing. Extra edge-function invocations on first load when stale files exist (one per stale file, runs once).

## 2026-05-25 — Stricter source verification + always-meaningful References
- What: (1) Link checker now rejects 5xx, 400/451, DNS failures, and timeouts (was: trusted by default). (2) References block always includes ≥5 catalogue links (or all of them if <5), topping up from the catalogue when inline citations are sparse.
- Why: User reported broken/fabricated reference URLs surviving in published articles. Lenient checker was passing dead links; rebuild was producing empty/short References when the model under-cited.
- Files: supabase/functions/generate-content/index.ts
- Verify: Re-generate Screwless article; References lists ≥5 catalogue URLs from the brief (PubMed/Bicon/AspenDental/etc.), zero fabricated URLs, log line "SOURCE GUARD: References rebuilt with N catalogue link(s)".
- May break: Verified broken: nothing. Confirmed by reading the two edited blocks and grepping for callers — checkSourceUrl is only used inside the catalogue acceptance loop; the rebuild block runs after stripDisallowedArticleLinks so no inline-link rewrite races.
