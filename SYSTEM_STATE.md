# System State

## Last Change Made
- **Fix 1 — Classic generation TDZ resolved.** Moved the entire `ownDomains` setup block (including `isOwnDomainUrl` closure) in `supabase/functions/generate-content/index.ts` to immediately before `extractContextSourceCandidates` is invoked. Classic Mode with context files now returns HTTP 200 with no `ReferenceError`.
- **Fix 2 — Proprietary fallback bullets removed.** Gutted `buildFallbackBullets` in `supabase/functions/proprietary-generate-article/index.ts` to `return []`, eliminating the boilerplate "Ask which specific … category applies …" template strings from body sections.
- **CTA contradiction resolved.** Final CTA now reads as an honest, non-promotional consultation prompt aligned with the misnomer thesis.
- Both fixes verified clean with zero regressions across Classic Mode (with and without context file) and Proprietary Mode end-to-end generation.

## Currently Incomplete or Known Issues
- **Duplicate table emission** — the identical 5-column / 3-row comparison table appears verbatim twice in proprietary-mode articles. Deduplication logic in `ensureMinimumTables` is not working as intended. Diagnosis in progress.
- **Invisalign research brief in brain still truncated at 1,459 words** — re-upload of the full DOCX required now that the 500k character extractor cap is live. After re-upload, `reembed-document` must be run before regeneration.
- **Second CTA missing from article layout** — AEO layout requires 2 CTAs per article; proprietary output currently emits only the final CTA. Needs a second CTA block inserted between the last body section and the FAQ, in the same honest non-contradictory tone.
