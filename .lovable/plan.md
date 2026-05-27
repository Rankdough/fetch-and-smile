## Goal

Make the Experience Signal / Commodity Gate **optional via a global setting**, and apply the same gate to both:

1. **Article generation** (Index.tsx → `generate-content`)
2. **Blog idea generation** (KeywordClustering → `cluster-keywords-enrich`)

When the setting is OFF (default), nothing changes anywhere — current behaviour preserved.
When the setting is ON, both flows get the experience signal injection + commodity badge.

## Setting

New global toggle stored in `localStorage` (`seo-generator-experienceGate`, default `false`). Surfaced in a small **Settings** popover added to the top-right of `Index.tsx` and `KeywordResearch.tsx` headers (Gear icon). Single switch:

> **Non-commodity content gate**
> Require first-hand experience signals (cases, numbers, named outcomes) before generating. Adds a commodity badge to outputs. Never blocks generation.

Persisted client-side. No server config needed.

## Shared building blocks (one file each, reused by both flows)

- `src/lib/experienceSignals.ts` — pure functions:
  - `extractSignals(text, sources)` → array of `{type, snippet, source}` tagged with `case-volume | named-operator | concrete-price | named-outcome | procedural-specificity | patient-story | internal-protocol`. Deterministic regex + heuristics (numbers, named entities, dates, currency, named complications). No LLM call — keeps it cheap and instant.
  - `gradeCommodity(signals, outputText)` → `{badge: 'red'|'amber'|'green', score, reasons[]}`. Counts signal density, hedge-phrase hits, generic-claim ratio.
  - `HEDGE_PHRASES` constant + `stripHedges(text)` regex post-pass that swaps banned phrases with `Ask the clinical team for current figures`.

- `src/components/CommodityBadge.tsx` — small pill (Red/Amber/Green) with tooltip listing reasons. Reused in article editor, saved articles list, and on each blog idea card.

No new edge function, no new DB table, no DB migration. Signals are computed client-side from already-loaded sources (topic context files, knowledge hub, client domain if cached). Keeps scope tight.

## Flow 1 — Article generation (Index.tsx)

When gate ON:
1. Before calling `generate-content`, run `extractSignals` over: selected context files + brain insights already in memory. Build a short `experiencePack` string (top 12 snippets, ~1.5KB).
2. Pass `experiencePack` to `generate-content` as a new optional field on the request body.
3. In `supabase/functions/generate-content/index.ts`, if `experiencePack` is present, inject this block into the system prompt:
   > **Experience Signals (cite at least one per H2 or write `Ask the clinical team for current figures on X`):**
   > {snippets}
   > Banned hedge phrases: {list}. Never use them.
4. After generation returns, run `stripHedges` client-side, then `gradeCommodity` → render `<CommodityBadge>` in editor header. If empty pack, show a yellow banner above Generate: *"No experience signals found in selected context. Output will be commodity-graded."* — Generate button stays enabled.

When gate OFF: skip all of the above. `generate-content` receives no `experiencePack` and behaves identically to today.

## Flow 2 — Blog idea generation (KeywordClustering / cluster-keywords-enrich)

When gate ON:
1. In `KeywordClustering.tsx`, before calling `cluster-keywords-enrich` (also from Regenerate / + Blog Ideas buttons in `ContentQueue.tsx`), gather signals from project-wide context: knowledge hub + any uploaded context docs tied to the cluster's topic. Pass `experiencePack` on the request body.
2. In `supabase/functions/cluster-keywords-enrich/index.ts`, when `experiencePack` is present, append to the system prompt:
   > **Value promises must reflect these real experience signals where possible. Do not invent statistics. If a promise needs a number, either use one from the signals or phrase it as `Find out [clinic_name]'s actual figures on X`:**
   > {snippets}
3. After enrichment returns, run `gradeCommodity` per idea against the title+description+value_promises text. Attach `commodity_badge` to each idea object in local state (not persisted to DB — derived on render).
4. Render `<CommodityBadge>` on each blog idea card in `ContentQueue.tsx` next to the "Saved / Use for Article" actions.

When gate OFF: no signal extraction, no prompt injection, no badge — identical to today.

## Files

**New:**
- `src/lib/experienceSignals.ts`
- `src/components/CommodityBadge.tsx`
- `src/components/SettingsPopover.tsx` (gear icon + the single switch)

**Edited (additive, behind `if (gateEnabled)` guards so OFF == current behaviour):**
- `src/pages/Index.tsx` — mount SettingsPopover, gate logic before generate, badge in editor header
- `src/pages/KeywordResearch.tsx` — mount SettingsPopover
- `src/components/keyword-research/KeywordClustering.tsx` — pass experiencePack on enrich calls
- `src/components/keyword-research/ContentQueue.tsx` — render badge on idea cards
- `supabase/functions/generate-content/index.ts` — accept optional `experiencePack`, inject into prompt when present (no-op when absent)
- `supabase/functions/cluster-keywords-enrich/index.ts` — same pattern
- `CHANGELOG.md`

**Untouched:** all article structure, formatting, exports, images, CTAs, internal links, fix-broken-links, tone profile, value promise rules, keyword dedup, clustering classification, every other edge function.

## Verify

1. Setting OFF (default): generate an article and regenerate blog ideas → byte-identical request bodies vs current main, no badge anywhere.
2. Setting ON, empty context: warning banner above Generate; article still generates; Red badge shown; ideas show Red badges.
3. Setting ON, rich context (upload a doc with "412 cases in 2024, avg saving £8,400"): signals appear in injected prompt block (verify via edge logs); article uses the figure; Green badge; no hedge phrases survive `stripHedges`.
4. Toggle OFF mid-session → next generation skips all gate logic.
5. Build passes, no TypeScript errors.

## Out of scope

- No DB migration, no new edge function, no Firecrawl crawl, no per-silo expert profile table, no manual override fields, no persistence of badge to `saved_articles`. Pure client-side signal extraction + optional prompt injection. We can layer those later if the lightweight version proves useful.