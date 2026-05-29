Root-cause fix: kill raw-HTML reference rendering at the source

1. `supabase/functions/proprietary-generate-article/index.ts`
   - Delete `escapeHtml`, `renderReferenceItem`, `renderReferencesList` helpers entirely.
   - Inline pure markdown bullets in `injectReferences`:
     ```ts
     const items = references.map((ref) => {
       if (ref.url && /^https?:\/\//i.test(ref.url)) {
         return `- [${ref.title.trim()}](${ref.url.trim()})`;
       }
       return `- ${ref.title.trim()}`;
     }).join("\n");
     return `${markdown.trimEnd()}\n\n## References\n\n${items}\n`;
     ```
   - Apply identical inline mapping in `ensureTrustedReferences`.
   - No other call sites — verified by grep (`renderReferenceItem`/`renderReferencesList` only used in these two functions).

2. `src/pages/Index.tsx` — frontend cache scrubber
   - In `setGeneratedContent` (and the localStorage hydrators that already call `cleanContent`), add a one-shot scrub that, only inside the trailing `## References` block, strips `<ul>`/`</ul>` wrappers and converts each `<li>...<a href="URL"...>Title</a>...</li>` into `- [Title](URL)`. Plain `<li>Text</li>` becomes `- Text`. Inline styles, `target`, `rel` attributes are dropped.
   - Scope: only the substring from the last `## References` heading to end of document. Body content untouched.
   - Purpose: wipe stale BUILD-H raw HTML cached in users' localStorage from previous runs. New generations won't need it (source is fixed), but it keeps existing sessions clean.

3. Validation
   - `deno check` on the edited edge function.
   - Grep to confirm zero remaining references to the deleted helpers.
   - Fixture test in browser console / mental trace: feed the screenshot's `<ul style="..."><li style="..."><a href="...">Title</a></li>...</ul>` string through the frontend scrubber and confirm it becomes clean `- [Title](url)` bullets.

4. `CHANGELOG.md`
   - Newest-on-top entry: BUILD-2026-05-29-O. What/why/files/verify/verified-broken sections per the project rule.

Out of scope (not touched)
- Internal-link function logic.
- Inline-source guards.
- Any prompt, model, or article-structure code.