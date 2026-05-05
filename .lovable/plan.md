## Goal

Make the Shopify FAQ Bulk page produce Body HTML that is byte-for-byte the same quality as the Content Migration page (`/content-migration`), then write that HTML into the existing Shopify CSV columns and download as CSV. Keep the bulk page's spreadsheet (handles, blog metadata, metafields, per-row 300/500/700 buttons, etc.) — just swap its generation core for the proven Migration pipeline.

## What's wrong today

The Bulk page calls `generate-content` directly with a thin prompt and renders with `markdownToStyledHtml`. The output is missing inline styles in practice (no TL;DR panel, no Quick Tip pill blocks, raw quote chars, empty `id=""` H2s) and doesn't get the post-processing that Migration does.

Content Migration runs a richer pipeline that already produces the styled HTML the user wants:
1. Tailored `instructions` block (AI-quotable opening, question H2s with answer paragraphs, table-for-lists, no In This Article, etc.)
2. `generate-content` with `migrationMode: true`, tone profile, skip flags, optional CTA
3. `rewrite-intro` to deduplicate the opening
4. Optional `auto-internal-links` (skip for FAQs)
5. `markdownToStyledHtml(markdown, palette, opts)` for inline-styled HTML
6. Optional appended CTA block via `generateCTAHtml`
7. `minifyHtmlForExport` + Excel cell limit guard

## Plan

### 1. Extract the Migration generation core into a shared helper

New file `src/utils/generateMigrationArticle.ts` exporting `generateMigrationArticle(input)`:

Input:
- `topic` (string, required)
- `sourceMarkdown` / `sourceHtml` (optional — Bulk won't pass these)
- `targetWordCount` (number)
- `palette` (ColorPalette | null)
- `convertOpts` (`skipNavigation`, `skipQuickTips`, `skipFaqs`, `skipSources`)
- `toneProfileId` (optional)
- `cta` (`{ url, instruction }` optional)
- `extraInstructions` (string, optional — Bulk uses this for "FAQ-style, answer the question directly")

Output:
- `markdown` (raw)
- `html` (styled, minified, with appended CTA if any)
- `title`, `subtitle`, `seoTitle`, `seoDescription`

Internally reuses the exact instruction block from `ContentMigration.tsx` lines 442–464, with the source-content rules made conditional (only included when `sourceMarkdown` is provided). Calls `generate-content` → `rewrite-intro` → `markdownToStyledHtml` → `generateCTAHtml` → `minifyHtmlForExport`. Skips `auto-internal-links` and `translate-content` (not needed for the FAQ bulk use case).

Refactor `ContentMigration.tsx` to call this helper for the EN path (translations and link insertion stay inline in that file). Behaviour unchanged.

### 2. Rewire the Shopify FAQ Bulk page to use the helper

In `src/pages/ShopifyFaqBulk.tsx` `regenerateRow`:
- Replace the current `supabase.functions.invoke("generate-content", ...)` + `markdownToStyledHtml` block with a single call to `generateMigrationArticle({...})`.
- Pass:
  - `topic = formattedTitle`
  - `targetWordCount = wc` (300 / 500 / 700)
  - `palette = null` (or expose a palette picker — see settings below)
  - `convertOpts = { skipNavigation: !includeNav, skipQuickTips: false, skipFaqs: !includeFaqs, skipSources: true }`
  - `extraInstructions` adds: "This is an FAQ-style article. Answer the question directly and concisely. Keep the article close to ${wc} words."
  - `cta = undefined` for now (can add later)
- Write the returned `html` into the row's `Body HTML` column.
- Use `subtitle`/`seoDescription` from the helper to populate `Summary HTML`, `description_tag`, `custom_answer_summary`, `subheading` (replaces the current local `extractSummary` heuristic).

### 3. Settings cleanup on the Bulk page

The Bulk Settings card already has Author, Sport, default word count, handle prefix, blog handle/title, template suffix, Include FAQ, Include In This Article. Add:
- **Color palette** picker (reuse `ColorPaletteSelector`, default: none = neutral) — passed through to the helper so styling matches Migration.
- **Tone profile** picker (reuse the same loader Migration uses) — optional.
- **Skip Quick Tips** and **Skip Sources** checkboxes for parity.

Persist in `localStorage` like the existing toggles.

### 4. CSV download stays unchanged

The CSV writer (`downloadCsv`, line 254) already escapes correctly. No change. Excel cell limit (32,767) check added before download — show toast if any Body HTML exceeds, matching Migration's guard.

### 5. Files to change

- New: `src/utils/generateMigrationArticle.ts`
- Edit: `src/pages/ContentMigration.tsx` — extract logic, call helper for EN generation
- Edit: `src/pages/ShopifyFaqBulk.tsx` — replace generation block, add palette/tone/skip-tips/skip-sources to Settings, add cell-limit guard before CSV download

### 6. Verification

After build, generate a 300-word FAQ in the Bulk tool and compare its Body HTML against the same topic generated in `/content-migration`:
- TL;DR panel with coloured left border
- Quick Tips with numbered circle pills
- H2s with proper slug ids
- Tables styled with gradient headers
- No leading/trailing `"` paragraphs
- All `style="..."` attributes preserved through CSV escaping
