
## What's changing (and what isn't)

Three precise additions inspired by Google's GenAI Search guide. **No changes** to the AEO layout, word-count rules, export format, CTA/table cadence, tone enforcement, or anything not listed below.

---

### 1. First-Hand Evidence input — SEO Content Generator settings

**Goal:** Let the user paste a first-person anecdote, case study, internal data, or expert observation that the writer must weave into the article. This is the single biggest GenAI-visibility signal Google calls out ("non-commodity, first-hand experience").

**Where:** `src/pages/Articles.tsx` — add a new optional collapsible field in the generator settings panel, labelled **"First-Hand Evidence (optional)"** with helper text: *"Anecdote, case study, internal data, or expert observation. The writer will weave this into the article as a concrete, citable detail."*

**How it flows:**
- New state `firstHandEvidence: string`, persisted alongside other generator inputs.
- Passed through to `supabase/functions/generate-content/index.ts` in the request body.
- Injected into the system prompt as a dedicated block: *"FIRST-HAND EVIDENCE TO INCORPORATE — weave this naturally into at least one body section. Do not invent facts beyond what is stated here. Do not quote it verbatim if the tone profile forbids first-person; paraphrase into the allowed perspective."*
- Respects existing 3rd-person rule (paraphrases away "I/we" if that perspective is active).
- Empty string = no behavioural change (fully backward compatible).

**Not changed:** article structure, word count, sections, exports.

---

### 2. Commodity-content guardrails — writer prompt only (copy, not format)

**Goal:** Push the writer away from generic listicle phrasing ("7 Tips for…", "In today's world…", "It is important to…") toward specific, experiential, non-commodity copy. Per your confirmation: **prompt-side only**, the AEO skeleton stays identical.

**Where:**
- `supabase/functions/generate-content/index.ts` system prompt — add a "NON-COMMODITY WRITING RULES" block.
- `supabase/functions/humanise-write-section/index.ts` — mirror the same rules so section rewrites don't regress.

**Rules added to the prompt:**
- Avoid generic openers: "In today's world", "When it comes to", "It is important to", "Many people".
- Prefer specific over generic: named examples, concrete numbers, scenarios over abstractions.
- Each H2 body should contain at least one concrete element (a number, named example, scenario, or direct quote) — not just abstract advice.
- Don't restate common knowledge as if it's insight.
- If First-Hand Evidence is provided, anchor at least one section to it.

**Not changed:** No new sections, no new word-count rules, no structural validators. The existing humanness/quality scorer already covers detection on the back end — we're just steering the front-end of generation.

---

### 3. Consolidation Suggester — Keyword Research

**Goal:** When two blog ideas in the same silo are semantically near-duplicates, flag them and offer a one-click merge. This prevents users from triggering Google's "scaled content abuse" pattern by producing multiple thin articles for keyword variants.

**Where:** `src/components/keyword-research/KeywordClustering.tsx` (or the ideas list view within it).

**How it works:**
- Reuse the existing fuzzy/core-question normalization from `KeywordDeduplicator` (already deterministic, no AI cost).
- On idea list render, compute pairwise similarity within each silo. Pairs above threshold (e.g. ≥0.85) get a subtle **"Similar to: [other idea title]"** chip on the idea card with a **"Review & Merge"** action.
- Clicking opens the existing **Combine Ideas** flow (already implemented per memory) pre-populated with the two ideas.
- Pure UI/UX surface — no changes to data model, generation, or export.
- A small dismiss-per-pair state (localStorage) so users can ignore a suggestion permanently.

**Not changed:** silo logic, classification, value-promise generation, queue, exports.

---

### Out of scope (per your instructions)

- ❌ #3 Image/video enforcement
- ❌ #4 Page-experience export lint
- ❌ #6 Author/E-E-A-T metadata

---

### Validation plan

- **#1**: generate with and without evidence; confirm output structure identical, evidence appears woven in when provided, no first-person leakage in 3rd-person mode.
- **#2**: generate same topic before/after; confirm word count, section list, table count, CTA count, FAQ count all unchanged; confirm opener and abstract-phrase usage drops.
- **#3**: load a project with known near-duplicate ideas; confirm chip appears, Combine flow opens pre-populated, dismiss persists across reload.
