# System State

## Last Change Made
- **AI Extraction Rules 9–16 added to proprietary assembler.** Appended `AI_EXTRACTION_RULES` block to `supabase/functions/_shared/proprietaryPromptAssembler.ts` covering Answer Proximity, Self-Contained Sentences, Methodology Disclosure, Information Gain Over Consensus, Buyer Journey Stage Matching, Off-Site Quotability, Ghost Citation Prevention, and Multi-Engine Data Density. Injected into both body and framing branches of `assembleSectionPrompt`. Rules 1–7 byte-identical. `proprietary-generate-section` redeployed.
- **Fix 1 — Classic generation TDZ resolved.** Moved the entire `ownDomains` setup block (including `isOwnDomainUrl` closure) in `supabase/functions/generate-content/index.ts` to immediately before `extractContextSourceCandidates` is invoked. Classic Mode with context files now returns HTTP 200 with no `ReferenceError`.
- **Fix 2 — Proprietary fallback bullets removed.** Gutted `buildFallbackBullets` in `supabase/functions/proprietary-generate-article/index.ts` to `return []`, eliminating the boilerplate "Ask which specific … category applies …" template strings from body sections.
- **CTA contradiction resolved.** Final CTA now reads as an honest, non-promotional consultation prompt aligned with the misnomer thesis.
- **Duplicate table fix.** `ensureMinimumTables` now hashes table signatures and injects section-aware variants; offset bumped from `inserted * 3` to `inserted * 5`.

## Currently Working and Verified
- **Rules 1–8** (original proprietary generation rules): No Commodity Answers, Lead With Honest Answer, Distinguish Categories, Failure Modes Mandatory, Specific Numbers Over Ranges, Contradict Consensus, Topic-Derived Table Columns, Topic-Specific Tables Only.
- **Rules 9–16** (AI Extraction Rules, deployed via `proprietary-generate-section`):
  - Rule 9 — Answer Proximity (direct answer in first 80 words of body).
  - Rule 10 — Self-Contained Sentences (no orphan pronouns, no unverifiable qualitative claims).
  - Rule 11 — Methodology Disclosure (one explicit sourcing sentence per article containing data).
  - Rule 12 — Information Gain Over Consensus (every body section carries at least one non-commodity data point).
  - Rule 13 — Buyer Journey Stage Matching (Discovery / Validation / Execution, no mixing).
  - Rule 14 — Off-Site Quotability (brand name appears ≥2× as standalone quotable context).
  - Rule 15 — Ghost Citation Prevention (brand as subject in opening, ≥1 subheading, final thoughts).
  - Rule 16 — Multi-Engine Data Density (≥4 independently citable facts per article).
- Classic Mode with context files: HTTP 200, no TDZ.
- Proprietary Mode end-to-end generation.
- Duplicate-table dedup with section-aware variants.

## Currently Incomplete or Known Issues
- **Invisalign research brief in brain still truncated at 1,459 words** — re-upload of the full DOCX required now that the 500k character extractor cap is live. After re-upload, `reembed-document` must be run before regeneration.
- **Second CTA missing from article layout** — AEO layout requires 2 CTAs per article; proprietary output currently emits only the final CTA. Needs a second CTA block inserted between the last body section and the FAQ, in the same honest non-contradictory tone.
