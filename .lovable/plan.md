# Fix proprietary-generate-article 500 + actually wire internal links

## Promise ledger (must all pass before reporting done)
1. `proprietary-generate-article` returns HTTP 200 on a real generation.
2. No `ReferenceError` in edge logs after redeploy.
3. Internal links are inserted into the proprietary output (or explicitly reported as 0 with reason).
4. References section present with inline `Source:` lines where applicable.
5. Changelog entry reflects only verified outcomes.

## Root cause hypothesis
`splitGluedBullets` IS defined at line 673 of `supabase/functions/proprietary-generate-article/index.ts` and called at line 1008. The runtime `ReferenceError` against BUILD-2026-05-28-H means the deployed bundle is out of sync with the source on disk — the previous deploy did not pick up the new helper, OR the helper was added to a sibling file but not imported here. Either way, the fix path is the same: re-verify the source has all 5 helpers defined in-file, force a fresh deploy, and run a real generation to confirm.

## Steps

### Step 1 — Audit helper call sites (read-only)
In `proprietary-generate-article/index.ts`, confirm every helper called inside the handler is defined in the same file:
- `splitGluedBullets` (line 673) ✓ present
- `stripAtomicPhrases`
- `enforceThreeBulletsPerBodySection`
- `injectInThisArticle`
- `injectHowToChoose`
- `ensureMinimumTables`
- `ensureFinalThoughtsCta`
- `collectBrainUrls`
- `attachInlineCitations`
- `injectReferences`
- `sanitiseGeneratedMarkdown`
- `isEmptyOrPlaceholder`

If any is missing → define it inline (no new files, no new imports) to keep deploy atomic.

### Step 2 — Bump build tag and redeploy
Change build banner from `BUILD-2026-05-28-H` → `BUILD-2026-05-28-I` at the top of `index.ts` so logs prove the new bundle booted. Deploy only `proprietary-generate-article`.

### Step 3 — Wire internal links
After `stitched = sanitiseGeneratedMarkdown(...)` and before returning JSON:
- If `body.internalLinkCandidates` (or equivalent field already on the request) is non-empty, call the existing `insert-internal-links` edge function via `fetch` with: `{ markdown: stitched, candidates, topic: body.topic }`.
- Replace `stitched` with the returned markdown.
- Log `INTERNAL LINKS: inserted=<n> skipped=<n>`.
- On failure or empty candidates, log `INTERNAL LINKS: skipped (reason=...)` and continue — never throw.

Confirm the request body field name by reading the client call site in `src/` that invokes `proprietary-generate-article`.

### Step 4 — Runtime verification (mandatory before reporting done)
Use `supabase--curl_edge_functions` to POST a real generation payload (same topic the user has been running: "Screwless Dental Implants"). Then:
- Assert HTTP 200.
- Fetch latest `proprietary-generate-article` logs, assert no `ReferenceError`.
- Assert response markdown contains `## References` and at least one `Source:` line.
- Assert log line `INTERNAL LINKS: inserted=` exists.

If any assertion fails → fix and re-run. Do NOT mark complete on deploy success alone.

### Step 5 — Honest changelog
Append `BUILD-2026-05-28-I` entry to `/CHANGELOG.md` with what was fixed, what was verified live, and any item that could not be verified (and why).

## Out of scope for this pass
- No outline / tone / table logic changes.
- No edits to `generate-content` (normal-mode path).
- No UI changes.

## Files touched
- `supabase/functions/proprietary-generate-article/index.ts`
- `CHANGELOG.md`
