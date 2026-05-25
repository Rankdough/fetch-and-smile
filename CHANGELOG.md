# Changelog

Every entry must list: **What changed**, **Why**, **What may break / side effects**, **Files touched**, **How to verify**.
Newest entries on top. Append-only — never edit or delete past entries.

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
