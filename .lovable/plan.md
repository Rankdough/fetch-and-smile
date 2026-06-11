# Proprietary Mode Rebuild — Single Batched Call

## Goal
Cut proprietary-mode cost by ~60% by replacing the per-section loop with one batched AI call, while preserving every Rule 1–16, the full CLAUDE.md Rule Checklist, and byte-identical post-processing.

## Current behaviour (the cost)
- `proprietary-generate-article/index.ts` loops `runSection()` once per H2 (typically 6–10 sections).
- Each call re-sends the entire system prompt + tone profile + value-promise rules + context files = ~5–8k input tokens × N sections = 35–70k input tokens per article.
- Additional small calls: H2 question generation, failure-mode heading, contradiction repair, entity bridge insertion.

## Target behaviour
- **One batched body call** sends the static block once, plus all section briefs (each with their own RAG chunks + per-section word budget) packed into a single user message.
- Model returns all sections in one response inside `<<<SECTION id="…" heading="…">>>…<<<END SECTION>>>` delimiters.
- Parser splits the response back into per-section content. If any section fails to parse, that single section falls back to the existing `runSection()` path (not the whole article).

## Hard constraints (non-negotiable)
- Public API of `proprietary-generate-article` unchanged.
- No model swap. Same `google/gemini-2.5-flash`.
- All post-processing preserved exactly: Rule-5 lint, Rule-6 contradiction repair, value-promise validation, fix-failed-claims, ensureMinimumTables, references injection, CTA injection, schema wrapping.
- No edits to `apply-format`, `insert-internal-links`, `parse-context-file`, `client.ts`, `types.ts`, `.env`, `supabase/config.toml`.
- Feature flag `USE_BATCHED_PROMPT` (env var, default `false`) — when off, behaviour is byte-identical to current.

## Deliverables

### New files
- `supabase/functions/_shared/proprietaryStaticPrompt.ts` — `buildStaticPromptBlock(input)` returning the system + global instructions that are identical across sections.
- `supabase/functions/_shared/proprietaryBatchParser.ts` — `parseBatchedSections(raw)` returning `{ sections: Map<id, body>, missing: string[] }`.

### Modified file
- `supabase/functions/proprietary-generate-article/index.ts`:
  - Add `USE_BATCHED_PROMPT` flag read at serve() entry.
  - New `generateBodyBatch(plan, staticBlock, perSectionRag)` and `generateTailBatch(...)` for Failure-Mode + How-to-Choose + FAQ + Final Thoughts (the tail sections also currently cost extra calls).
  - New parser path with per-section fallback to legacy `runSection()`.
  - Per-article telemetry log: `{ input_tokens, output_tokens, section_count, batched, fallback_section_ids }`.
  - Bump `BUILD_MARKER` to `BUILD-2026-06-11-V2P1-batched-prompt`.

### Changelog
- Append dated entry to `/CHANGELOG.md`.

## Phased rollout (in this session)

**Phase A — Safe extraction (commit 1)**
Extract the static block into `_shared/proprietaryStaticPrompt.ts`. Wire it back into `runSection()` so the existing loop calls it. Add a one-time boot-log assertion that the extracted block is byte-identical to the current inline assembly on the same inputs. No behaviour change.

**Phase B — Batched body path (commit 2)**
Add `generateBodyBatch` + parser + per-section fallback. Behind `USE_BATCHED_PROMPT=false`, no path change. With flag on, batched path runs for body H2s only (tail sections still per-call).

**Phase C — Batched tail path (commit 3)**
Extend batching to Failure-Mode + How-to-Choose + FAQ + Final Thoughts.

**Phase D — Telemetry + marker bump (commit 4)**
Add token telemetry log, bump `BUILD_MARKER`.

All commits land on a new branch `feat/v2-batched-prompt` off `fix/a1-tldr`. Nothing merged.

## What I will NOT do in this session
- Run the 5-article verification matrix or measure live token reduction — that needs Roman generating real articles in the preview, reading boot logs, and confirming output against the Rule Checklist (the FIX PROTOCOL step 7). I will give you the exact test instructions.
- Open a PR. The branch is ready for you to PR from GitHub UI once you've verified.
- Touch `apply-format`, `insert-internal-links`, or `parse-context-file`.
- Phase 2 (`article_contexts` table) or Phase 3 (silent-waste cleanup) — those are separate sessions.

## Risk register
- **Risk:** batched response truncates mid-section (12k token ceiling). **Mitigation:** budget sum capped, per-section fallback to legacy path on parse-miss.
- **Risk:** model ignores delimiter contract. **Mitigation:** parser detects missing IDs, those sections fall back to legacy path — article still ships.
- **Risk:** static-block extraction drifts from inline assembly (output not byte-identical with flag off). **Mitigation:** Phase A wires the extracted function back into the existing loop and asserts byte-identical at boot, so flag-off behaviour cannot drift.
- **Risk:** per-section RAG chunks duplicated in the batched message inflate input. **Mitigation:** RAG chunks are per-section dynamic content — they have to be sent anyway. The saving comes from not re-sending the 4–6k of static rules N times.

## Verification you will run after I commit
1. Confirm `BUILD-2026-06-11-V2P1-batched-prompt` in proprietary boot log.
2. With `USE_BATCHED_PROMPT` unset (default off): generate the jersey-stitching test article, diff against a current-baseline article on the same topic. Should be byte-identical on body, framing, CTAs, references.
3. Set `USE_BATCHED_PROMPT=true`: generate 5 articles (mix of clinical + sports). Run the CLAUDE.md Rule Checklist on each.
4. Read the telemetry log line for each article, compute avg input-token reduction. Target ≥40%.
5. If any step fails, set flag back to false — zero user impact, batched code is dormant.
