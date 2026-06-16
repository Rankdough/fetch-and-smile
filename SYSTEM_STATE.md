# System State

## Last Change Made
- **Second CTA injected before FAQ (BUG-1 closed).** Added `injectMidArticleCta()` to `supabase/functions/proprietary-generate-article/index.ts`. Inserts a second honest, non-promotional CTA paragraph immediately before `## Frequently Asked Questions` in every generated article. Idempotency guard prevents double-injection. Applies to all business types. `BUILD_MARKER` bumped to `BUILD-2026-06-16-second-cta`.

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
- **Second CTA** — injected before FAQ via `injectMidArticleCta()`. Idempotent. All business types.

## Currently Incomplete or Known Issues
- **Invisalign research brief in brain still truncated at 1,459 words** — re-upload of the full DOCX required now that the 500k character extractor cap is live. After re-upload, `reembed-document` must be run before regeneration.
- **FIX-01: F.U.S.E. abbreviation stash** — `articleContentRepairs.ts` has no abbreviation stash before the sentence splitter. TL;DR may still fragment on F.U.S.E., U.S.A., e.g., i.e.
- **FIX-02: Emoji handling** — not yet implemented.
- **FIX-03: TL;DR wrapper** — not yet implemented.

