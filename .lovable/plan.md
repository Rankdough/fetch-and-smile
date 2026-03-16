

## Root Cause Analysis

There are **two separate bugs**, both clearly traceable in the code and logs:

### Bug 1: Word count is never enforced

**Evidence from logs:** Target 300 words → generated 1300 → 4 condense passes → still 778 words → backend says "Not truncating to avoid content damage" and **returns the oversized content anyway** (line 621 of `generate-content/index.ts`).

**Why it fails:** The `rebalanceToRange` function runs 4 condense passes + 1 strict rebalance pass, all asking the AI to rewrite. But the AI consistently ignores tight word limits because the prompt demands heavy structure (TL;DR, Quick Tips, FAQ, tables, comparison sections, "How to Choose" checklist). For a 300-word target, that structure alone exceeds 300 words. The AI literally cannot comply.

After all passes fail, the code at line 620-622 just **logs a warning and returns the oversized content**. There is no hard enforcement. The frontend then accepts it as "done".

**Why previous fixes didn't work:** Every attempt relied on asking the AI to condense harder. The AI cannot produce a structurally complete article (TL;DR + Quick Tips + 3+ H2s + tables + FAQ + References + Final Thoughts) in 300 words. It is physically impossible.

### Bug 2: Excel export truncation

**How it currently works:** The frontend retry loop (lines 688-724) regenerates with smaller word budgets if the escaped HTML payload exceeds 32,000 chars. But since Bug 1 means the backend ignores the word budget anyway, reducing the budget has no effect. The content stays the same size. After 6 futile passes, it throws an error or produces oversized content.

The `compactHtmlForExcelLimit` function (line 175) now only deduplicates `<style>` blocks -- previous destructive stripping was removed. So there's no fallback to actually fit content that's too large.

---

## The Fix (Two Changes)

### Change 1: Deterministic word-count enforcement in `generate-content/index.ts`

Stop relying on AI to hit the word count. After all AI passes complete, if content still exceeds `wordCeiling`, **deterministically truncate by sections from the bottom up**, preserving valid markdown structure:

1. After `rebalanceToRange` returns, check word count against `wordCeiling`
2. If over, remove sections in this priority order until under ceiling:
   - References section
   - FAQ section  
   - Last body H2 section (repeat until fit)
3. Always preserve: H1, first paragraph, TL;DR, Final Thoughts
4. After section removal, do a final sentence-boundary trim if still over
5. Return content that is **guaranteed** `<= wordCeiling` words

This means a 300-word article will get a compact structure (maybe just TL;DR + 1-2 body sections + Final Thoughts) but it will be **exactly within range** and structurally valid.

Also: for `migrationMode` with targets <= 500, reduce the mandatory structure requirements in the prompt (skip FAQ, skip References, allow fewer body H2s).

### Change 2: Progressive HTML compaction fallback in `ContentMigration.tsx`

If after generation the escaped HTML payload still exceeds `EXCEL_SAFE_TARGET`, instead of re-generating (which doesn't work), apply **progressive inline-style compression** on the already-rendered HTML:

1. First pass: Minify + deduplicate styles (current behavior)
2. Second pass: Strip the "In This Article" navigation widget (heaviest HTML element, ~4-8K chars of inline SVG/styles)
3. Third pass: Strip FAQ accordion widget
4. Fourth pass: Compress all `style="..."` attributes to CSS classes via a shared `<style>` block
5. Final fallback: Strip all inline styles entirely (content remains semantic HTML)

This operates on the **final HTML output**, not on generation -- so it always works regardless of AI behavior. Content text and links are never removed.

### Files to change:
- `supabase/functions/generate-content/index.ts` -- deterministic section trimmer after AI passes; lighter prompt for low word counts
- `src/pages/ContentMigration.tsx` -- progressive HTML compaction in `compactHtmlForExcelLimit`; remove the futile 6-pass regeneration loop (replace with single generation + HTML compaction)

### Why this will actually work:
- Word count enforcement is **deterministic code**, not AI prompting. It mathematically cannot exceed the ceiling.
- HTML size reduction operates on **rendered output**, not AI generation. It mathematically cannot exceed 32,767 chars.
- Neither fix depends on the AI behaving correctly. Both are post-processing guarantees.

