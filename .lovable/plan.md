# Proprietary Content Engine — Final Build Plan

A parallel **Proprietary Mode** layered onto the existing app. The current generator stays untouched and remains the default. Proprietary Mode is the aspirational path: interview-driven extraction, typed knowledge units, outline-to-unit mapping, isolated-context section generation, and a structural commodity check. Non-destructive: existing tables get additive columns only; existing flows keep working.

## Locked architectural decisions

1. **Gate placement** — Parallel Proprietary Mode, not a replacement.
2. **Knowledge schema** — Typed: `case`, `outcome`, `failure`, `tradeoff`, `contrarian`. Mandatory minimum: 1 `case` + 1 `outcome`, each ≥80 words.
3. **Interview agent** — Silent 1–3 specificity scoring, two-pushbacks-then-escape, termination on mandatory types at score 3 plus two more at 2+.
4. **Brief intake** — Fixed picker, 6 branches + "other": service business / ecommerce / SaaS / healthcare-clinical / manufacturer / publisher / other. Plus one-sentence audience and publication destination (AI search / human blog / both).
5. **Traceability** — Outline-first, then AI proposes outline-to-unit mapping. Per-section dropdown override + "no match". Body sections generate in isolated context windows containing only their mapped unit(s).
6. **Commodity check** — Structural string/regex match against extracted unit content. Body sections only. Framing sections (TL;DR, FAQ, How to Choose, Intro, Final Thoughts, Quick Tips, References) excluded and labelled "framing". Contrarian-type flagged for human review, not auto-blocked.
7. **Cold start** — Generation unlocks at MVE floor (1 case + 1 outcome, ≥80 words each).
8. **Knowledge reuse** — Pre-interview panel with use/refresh/skip toggles per relevant unit.
9. **Staleness** — 6 months auto-flags "review recommended"; 4+ uses flags "may be overused"; user-flag always available. **Versioning non-negotiable**: refreshed units never replace, history kept as collapsed timeline.
10. **Interview UX** — Defaults to text, prominent voice option wired into existing voice-edit infrastructure. Voice mode = warmer pushback phrasing, same termination rules.
11. **Multi-user brain** — Attribution stored silently, shown as byline in brain panel only. Contradictions auto-flagged, coexist. Generation refuses to pair contradicting units in adjacent sections without resolution.
12. **Contradiction resolution** *(clarified)* — The contradiction flag in the brain panel offers three actions: **mark as context-dependent** (clears the generation block, both units stay active), **deprecate one unit** (the other becomes canonical), or **leave unresolved** (block stays). Without "context-dependent", users get stuck at the generation gate with no escape.
13. **Export contract** — Clean export, no metadata leakage. Audit trail stays in-app as downloadable PDF "Content Quality Certificate".
14. **Post-publish staleness loop** — Articles whose units later go stale show a banner with one-click access to a targeted mini-interview on the affected section.
15. **Targeted re-interview** — "Strengthen this section" button per body section triggers a two-question mini-interview, narrower scope, same agent.
16. **"Rewrite with proprietary input" wiring** *(clarified)* — Never regenerate from the same mapped unit (would reproduce commodity output). In Stage 3 ships as a **stub**: opens a simple freeform input asking for one specific detail to add to the unit, then regenerates the paragraph using the augmented unit. In Stage 4, upgraded to the full targeted mini-interview.
17. **Analytics from day one** *(added)* — Track Proprietary vs Classic comparison metrics from Stage 1 onwards: AI citation rate, recommendation visibility, time-on-page, and any other available signals per client. Without this baseline we won't have clean data to make the "should Proprietary become default" decision later.
18. **Sequencing** — Interview agent → Gap detector → Citation gate → Certificate + mini-interview + staleness loop.

## Stage 1 — Knowledge Schema + Interview Agent

The foundation. Nothing else works until the brain has typed content with attribution and versioning.

**Schema (additive migration):**
- `brain_insights`: add `unit_type` (case|outcome|failure|tradeoff|contrarian|legacy), `word_count`, `contributor_id` nullable, `business_type`, `parent_unit_id` (version history), `is_stale`, `stale_reason`, `usage_count`.
- New table `brain_unit_contradictions`: paired unit IDs + `status` (open | context_dependent | one_deprecated).
- Existing rows backfill to `unit_type = 'legacy'` so nothing breaks.
- New table `proprietary_analytics_events` for the day-one comparison telemetry.

**Edge function `interview-agent`:**
- Streams over existing `brain_chat_messages` infrastructure.
- Inputs: business_type, topic, audience, publication_destination, existing relevant units, gap list.
- System prompt encodes the three-layer architecture, 6 branch-specific question banks, 80-word floor per mandatory unit, termination rules.
- Outputs typed units written to `brain_insights`.

**New route `/proprietary/extract`:**
- Step 1 — Business-type picker (6 + other).
- Step 2 — Topic + one-sentence audience + publication destination.
- Step 3 — Existing knowledge panel with use/refresh/skip toggles.
- Step 4 — Interview (text default, voice toggle). Sidebar shows the typed-slot grid filling in real time with word-count progress.
- Step 5 — Review extracted units, edit, save.

**Brain panel additions:** unit type chips, version history timeline (collapsed), contradiction flags with three-action resolution, attribution bylines, usage counter, staleness indicator.

Ship Stage 1 standalone — users build a brain even before any proprietary article exists.

## Stage 2 — Gap Detector (Three-Bucket Model)

**Edge function `detect-knowledge-gap`:**
- Inputs: topic, keywords, competitor URLs, relevant brain units, context documents.
- Returns three buckets: **Commodity** (everyone covers), **Underserved** (market gap), **Proprietary** (drawn from the brain — seeds Stage 3 mapping).

**UI:** new "Knowledge Gap" panel on the proprietary setup screen. Three columns of chips, click-to-expand.

## Stage 3 — Outline Mapping + Isolated-Context Generation + Commodity Gate

The gate snaps shut.

**Edge function `outline-and-map`:**
- Generates outline (reuses AEO layout).
- Tags each section as `body` or `framing`.
- Proposes unit mapping per body section.
- Returns `{section_id, type, mapped_unit_ids[], no_match}[]`.

**Mapping review screen:** two-column table, dropdown per section to swap or mark "no match". One screen, ten seconds for most users.

**`generate-content` extension (non-destructive):**
- New input in proprietary mode: `mapping[]`.
- Section-by-section generation. Body sections see only their mapped units in context. Framing sections use general context (existing behaviour).
- Stores `proprietary_unit_ids[]` per section in sidecar map.
- Existing one-pass mode untouched — proprietary is a separate code path reusing the same prompt helpers.

**Edge function `commodity-check`:**
- Body sections only.
- Each paragraph must contain at least one structural anchor matching its mapped unit (number/date, named case, failure phrase, contrarian claim) via string/regex against unit content.
- Contrarian-type flagged for human review, not auto-blocked.
- Returns `mustRewrite[]` per paragraph.
- UI shows per-paragraph status; "Rewrite with proprietary input" button opens the Stage 3 stub (freeform "add one specific detail" input → augments unit → regenerates paragraph). Wired to upgrade to mini-interview in Stage 4.

**Contradiction guard:** before generation, check no two mapped units share an open contradiction. If they do, block and surface the three-action resolution UI inline.

**Schema (additive on `saved_articles`):**
- `mode` ('classic' | 'proprietary', default 'classic')
- `mapping` jsonb
- `proprietary_unit_ids` jsonb
- `commodity_report` jsonb
- `business_type`, `audience_sentence`, `publication_destination`

## Stage 4 — Audit Certificate + Mini-Interview + Staleness Loop

- **Content Quality Certificate PDF** per proprietary article: citation map, unit list, commodity pass rate, contributor bylines. Downloadable from article panel.
- **"Strengthen this section" mini-interview**: per body section button. Reuses `interview-agent` with `scope='single_section'`, ≤2 questions, writes new unit, remaps, regenerates the section only.
- **"Rewrite with proprietary input" upgrade**: replace Stage 3 freeform stub with the mini-interview flow.
- **Post-publish staleness loop**: when any unit referenced by a saved article goes stale, that article shows a yellow banner → opens mini-interview targeted at the affected section.

## What stays exactly the same

AEO layout, tone profiles, table/CTA/quick-tips rules, export pipeline, word-count distribution, image allocation, internal links, keyword research, migration tool, classic generation flow.

## What this explicitly does NOT do

- Does not modify any existing table column.
- Does not change the classic generator's prompts, word-count enforcement, or one-pass architecture.
- Does not block existing articles (`mode` defaults to 'classic' on every existing row).
- Does not embed metadata in exports.
- Does not solve the user-fabrication problem.

## Build order

```
Stage 1: Schema + Interview Agent + brain panel + analytics scaffolding
   ↓
Stage 2: Gap Detector (three-bucket)
   ↓
Stage 3: Outline mapping + isolated-context generation + commodity check
         (with Stage 3 stub for "Rewrite with proprietary input")
   ↓
Stage 4: Certificate PDF + mini-interview + post-publish staleness loop
         (upgrades the Stage 3 rewrite stub)
```

Each stage is independently shippable and independently useful.

Ready for build mode. Starting on Stage 1 when approved.