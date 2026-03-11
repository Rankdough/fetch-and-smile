
Goal: restore the exact workflow you want: one article per row, one HTML blob per single cell, no broken formatting, and target word count respected.

What I found
- The export regression is real and self-inflicted. The current “Download Excel” button no longer creates an Excel file. It now creates a quoted CSV:
  - `src/pages/ContentMigration.tsx:394-405`
  - filename ends in `.csv`
- That change removed the older Excel-style export path entirely. So even if the HTML itself is correct, the download format is now different, and spreadsheet apps will interpret/render it differently.
- The formatting issue is also real: the current export writes raw HTML into CSV cells. That is not the same behavior as the prior Excel export that you said was working.
- The word-count issue is also real, and the code explains why:
  - `src/pages/ContentMigration.tsx` sends strict migration instructions saying “do not include In This Article”
  - but `supabase/functions/generate-content/index.ts` has hard-coded global rules that still force:
    - `## In This Article`
    - long descriptions under it
    - minimum table counts
    - expert quote requirements
    - completeness guard appends missing sections
  - those generic generator rules are fighting the migration-specific instructions and inflating article length.

Root causes
1. Export root cause
- The working single-cell Excel behavior was replaced by CSV export in `downloadXLSX`.
- CSV is now the wrong transport for this use case because your workflow depends on Excel preserving a large raw HTML string inside one cell exactly as before.

2. Word-count root cause
- The migration page is reusing the general article generator, but that generator has mandatory structure rules that are too heavy for migration jobs.
- Even when migration instructions say “reformat only” and cap the word count, the generator still adds/forces extra sections and recovery passes.

3. Formatting root cause
- The HTML formatter itself is mostly deterministic and looks salvageable.
- The bigger regression is that export changed underneath it, so even valid HTML now looks “broken” once downloaded/opened in Excel.

Implementation plan
1. Restore true Excel export behavior for Content Migration
- Replace the current CSV-based `downloadXLSX` logic with a real Excel-compatible single-file export that preserves raw HTML in one cell exactly.
- Keep one row per URL.
- Keep one `Content` cell only.
- Do not split columns, do not add extra sheets.
- Ensure the HTML string is written as raw text cell content, not re-serialized in a way that damages formatting.

2. Preserve the exact HTML string during export
- Stop any export-time transformations that alter the HTML payload shape.
- Export the same `result.content` string shown in preview, byte-for-byte as closely as browser export allows.
- Verify quote handling so embedded attributes survive intact inside the cell.

3. Fix migration word-count compliance at the generation source
- Add a migration-specific mode in `generate-content` so Content Migration can bypass the generic forced article scaffolding.
- In that mode:
  - disable forced “In This Article”
  - disable expert quote requirement
  - relax mandatory table minimums unless source actually needs them
  - prevent completeness guard from appending migration-only forbidden sections
  - keep the rebalance pass, but make it obey migration structure instead of the generic article template
- Keep the existing normal generator behavior unchanged for the rest of the app.

4. Tighten the migration prompt contract
- Pass an explicit migration flag from `ContentMigration.tsx` to the generator.
- Make migration generation prioritize:
  - original structure
  - exact heading preservation
  - link preservation
  - target word range
  - no extra sections unless selected in the UI

5. Validate against your known-good example
- Use the uploaded `correct.xlsx` as the reference output format.
- Compare the repaired export behavior against that reference:
  - single cell
  - raw HTML intact
  - no row corruption
  - no formatting collapse from export

Testing plan
- Re-run one short job at 500 words and confirm final content lands within the intended range.
- Re-run one longer migration and compare:
  - preview HTML vs exported cell content
  - title/subtitle/SEO fields alignment
  - single-row integrity in Excel
- Open the downloaded file and confirm:
  - one cell contains the full HTML
  - no split-across-rows behavior
  - no broken quote escaping
  - formatting matches the previously working behavior as closely as possible

Scope control
- I would not touch unrelated generation flows.
- I would only change:
  - `src/pages/ContentMigration.tsx`
  - `supabase/functions/generate-content/index.ts`
- I would leave the markdown-to-HTML styling layer mostly intact unless testing shows one specific formatter bug still remains after export is restored.

Expected result
- Download works again as a true Excel-style export for this tool.
- Content stays in a single cell exactly as you requested.
- Export no longer breaks the HTML formatting.
- 500-word jobs stop ballooning because migration generation will stop inheriting the general article generator’s forced extra sections.
