# Keyword generation integrity

This change is based on main and is independent of runner PR #2. No live scanning or model calls are needed for its tests.

- Scan and generation share a synchronous operation guard, including the Enter-key path. All scan promises settle before unlocking. A failed scan clears prior terms; changes to site URLs/filters invalidate the scan. Users can explicitly discard a failed/stale scan and generate from other seeds.
- The request is snapshotted once, including the ordered combined seeds. Saved result JSON includes that request, source inputs, run IDs/time, exact model request (prompt, model, token budget, tool schema), response finish reason and usage. No API key is stored. The original result is retained when refinement changes the map. The last request can be downloaded even if generation fails; failed attempts are not stored in the database. Save failures show a warning and the run remains downloadable.
- Shared runtime validation checks structural safety, 12–20 clusters, 20–50 unique nonblank seeds and 15–30 unique nonblank questions per cluster. Whitespace/case duplicates do not inflate counts. The model schema also declares count constraints, but runtime checks are authoritative. Valid structured partial results return HTTP 200 with explicit `status: incomplete` and detailed validation on the result; malformed responses fail. There is no automatic retry, top-up or rescan.
- The UI shows incomplete results and saved-list status. Historical results are unverified, not retroactively certified. Refined maps are revalidated and only the active saved row is updated.
- Generated phrases are ideas, not measured search demand. Capturing exact inputs makes future comparisons auditable; it does not make model output deterministic or establish equivalence with historical runs whose requests are missing.

## Offline validation

`npx vitest run src/test/keywordValidation.test.ts src/test/keywordScanTiming.test.tsx`

The replay fixture is copied unchanged from PR #2 commit bb4c1f4ae56c78330ff242059a13cfecc0838fbb, `research-results/best-student-halls/verbatim-replication/response.json`. It is the later replay, not the first 138-seed run; it satisfies the count contract. Tests also shorten a copy and cover malformed output, count boundaries, duplicates, scan timing, Enter submissions, changed sites and failed rescans. No historical comparison assumes equal inputs.

## Deployment

Deploy `generate-keyword-universe` with its shared validator and deploy the frontend. No database migration is required: metadata is stored in the existing results JSON. Older callers still receive results but should inspect `status`/`results.validation`. No changes have been deployed by this PR.

## Repository check caveats

Production build passes. The repository's package-lock is already out of sync (`npm ci` fails for missing pdfjs-dist/xlsx dependencies); local validation used `npm install --package-lock=false --ignore-scripts` and removed the unbuilt optional canvas package locally so jsdom can use its canvas-free mode. Dependency manifests/lockfiles are unchanged.

The full suite has two unrelated failures in articleRegressionVerification.test.ts (visible Sources blocks). Type checking reports an unrelated project_id schema mismatch at src/pages/Index.tsx:1152. These files are unchanged.
