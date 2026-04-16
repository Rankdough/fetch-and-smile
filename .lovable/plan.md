
What happened

- The Brain is currently built like a destructive rewrite system, not a stable learning system.
- Every time a file finishes review, `cross-reference-insights` runs and regenerates `brain_strategy.content`.
- Every time a file is deleted, `BrainLibrary.tsx` calls `cross-reference-insights` with `rebuildOnly: true`, which regenerates the strategy again.
- That means the visible Core Principles/Core Tactics are not being preserved as fixed knowledge. They are being re-authored by the model from the current approved insight set.

Why your bookmarked stuff disappeared

- The stars in the strategy UI are not true locked principles.
- In `src/pages/BrainLibrary.tsx`, clicking a star only saves raw bullet text into `brain_strategy.prioritized_points`.
- In `src/components/StrategyWithPriorities.tsx`, those stars are only used to highlight bullets that still exist in the current markdown.
- So if the next rebuild rewrites or removes a bullet, the stored priority still exists as text, but it no longer has anything visible to attach to.
- In plain English: the app saved “this bullet is important”, but it did not save “this bullet must always remain in the strategy”.

Why uploads changed the whole strategy

- `supabase/functions/cross-reference-insights/index.ts` fetches all approved insights, asks the model to produce fresh `core_principles`, `core_tactics`, and `watch_out`, then overwrites `brain_strategy.content`.
- The prompt says to preserve prioritised points, but that is only soft instruction. The code does not enforce it after the model answers.
- So a new upload can shift the whole output because the model is synthesising a new strategy every time.

Why bookmarks did not protect anything

- The new insight bookmark field `brain_insights.is_bookmarked` exists in the database.
- But it is not wired into:
  - the Insights UI,
  - the strategy generator,
  - or Ask Brain retrieval.
- So bookmarking insights currently has no real weight in the system.

Why credits got burned

- Each upload can trigger at least two expensive AI steps:
  1. `analyze-brain-file` to summarise and extract insights from the document
  2. `cross-reference-insights` to rebuild strategy from all approved insights
- Repeated retries, file changes, and rebuilds multiply that.
- So the credits were spent on real model calls, but the architecture was wrong, so you paid for repeated rewrites instead of stable learning.

Root cause in one sentence

- The system treated your Brain as “regenerate the latest strategy from current inputs” instead of “grow a stable, curated knowledge base with locked foundations”.

What I would build to fix it

1. Split the Brain into clear layers
- Raw files
- Extracted insights
- Approved knowledge
- Bookmarked knowledge
- Stable strategy anchors

2. Make pinned strategy points real data
- Add dedicated fields like locked core principles and locked core tactics.
- Store them separately from generated markdown.
- Render them back deterministically after every rebuild.

3. Make uploads additive, not destructive
- New files should add evidence, suggest refinements, or create contradictions.
- They should not silently replace pinned foundations.

4. Make insight bookmarks actually matter
- Add a bookmark toggle in Insights.
- Feed bookmarked insights into strategy generation as high-priority evidence.
- Weight them above normal approved insights.

5. Preserve user curation over AI synthesis
- If you starred or locked “Visibility Gain”, it stays until you unpin it.
- If a new file conflicts with it, show that as a contradiction instead of overwriting it.

6. Add recovery safeguards
- Snapshot previous strategy before rebuilds.
- Never let file deletion wipe curated anchors.
- Warn before destructive changes.

Implementation scope once approved

- Update the strategy schema to store locked principles/tactics separately.
- Refactor `cross-reference-insights` so it merges locked points back in after generation.
- Wire `brain_insights.is_bookmarked` into `BrainInsights.tsx`, `ask-brain`, and strategy generation.
- Keep existing strategy stars, but redefine them as hard pins rather than soft highlights.
- Add a fallback snapshot so future rebuilds are reversible inside the app logic.

Expected result

- Uploading files will enrich the Brain instead of replacing it.
- Your core principles stop drifting every time new evidence arrives.
- Bookmarked insights genuinely influence the Brain.
- Pinned principles and tactics cannot disappear just because the model rewrote the markdown.
