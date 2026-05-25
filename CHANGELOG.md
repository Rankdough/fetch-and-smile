# Changelog

Every entry must list: **What changed**, **Why**, **What may break / side effects**, **Files touched**, **How to verify**.
Newest entries on top. Append-only — never edit or delete past entries.

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
