
The user wants to be able to **select gaps** (from the amber "Information Gain Gaps" box), not just angles. Currently gaps are read-only context — only angles have checkboxes.

Let me look at the current UniqueAnglesPanel to understand the structure.
<lov-tool-use id="toolu_vrtx_015zXGtrVSmzPcjawe6Cds3a" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/UniqueAnglesPanel.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01WfiTgX3geFiDo3Yxa1ZiaC" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/UniqueAnglesPanel.tsx\"}">
</lov-tool-use>
The user wants to pick a specific gap (not just an angle) to cover. Currently gaps are read-only. Let me check how angles flow into generation, then plan to make gaps selectable.
<lov-tool-use id="toolu_vrtx_019pfgGZxDEekqfpep4oafq9" name="code--search_files" integration-id="code" data="{\"query\": \"selectedAngles\", \"include_patterns\": \"*.tsx,*.ts\"}">
</lov-tool-use>
Good — there's already a `selectedGapInsights` mechanism (used by `GapAnalysisSelector` for the broader gap analysis output), and it gets merged with `selectedAngles` and passed into generation. So the cleanest path is to make the **Information Gain Gaps** in the Unique Angles panel selectable too, and have the selected gap text feed into the same `selectedGapInsights` (or a new prop) so the generator covers that gap.

<lov-plan>

## Goal
Let the user pick one or more **Information Gain Gaps** from the Unique Angles panel (the amber box) — not just the angle cards — so the article specifically commits to filling that gap.

## Current flow (just confirmed in code)
- `UniqueAnglesPanel` shows gaps in the amber box as **read-only**, and angle cards as selectable.
- Selected angles flow via `selectedAngles` → merged with `selectedGapInsights` in `Index.tsx` line 1207 & 1473 → passed into `generate-content` and `generate-outline` as "UNIQUE ANGLES TO INCORPORATE".

## Plan: make gaps selectable in the Unique Angles panel

### 1. `src/components/UniqueAnglesPanel.tsx`
- Add a new prop `selectedGaps: string[]` and `onGapsChange: (gaps: string[]) => void`.
- In the amber "Information Gain Gaps" box (lines 140-163):
  - Auto-expand when gaps first arrive (already does via `showGaps`).
  - Replace each read-only gap row with a clickable card containing a checkbox (same pattern as the angle cards below).
  - Selecting a gap stores its `gap` text (the diagnosis line) in `selectedGaps`.
  - Show "X selected" pill in the gaps header when any are picked, plus a "Clear" button.
- Add a one-line helper above the gaps list: *"Pick the gaps you want this article to fill — the AI will commit to covering them."*

### 2. `src/pages/Index.tsx`
- Add new state `selectedAngleGaps: string[]` (persisted to localStorage like `selectedAngles`).
- Pass `selectedGaps={selectedAngleGaps}` and `onGapsChange={setSelectedAngleGaps}` to `<UniqueAnglesPanel>`.
- Merge into the existing angles payload at the two sites that build `allAngles`:
  - Line 1207: `uniqueAngles: [...selectedGapInsights, ...selectedAngles, ...selectedAngleGaps]`
  - Line 1473: same merge in `enhancedInstructions`
- Include in snapshot save/restore (lines 1577, 1633, 1656) and in reset (line 1712) + localStorage cleanup (line 1730) — same pattern as `selectedAngles`.
- Update the GenerationChecklist counter (lines 956-980) to also reflect selected gaps in the "Angles selected" label.

### 3. No edge-function change needed
The selected gap text is just appended to the existing `uniqueAngles` array, which `generate-content` and `generate-outline` already treat as "MUST be incorporated" instructions. This means each selected gap effectively becomes a directive: "fill this knowledge void in the article."

### 4. Out of scope (not touching)
- `generate-unique-angles` edge function — gap generation logic stays as-is.
- `GapAnalysisSelector` (separate component for the bigger Gap Analysis output) — already works.
- Angle cards, tone logic, prompts, scoring, exports — untouched.

## UX result
The amber box becomes interactive: each gap shows a checkbox + the same "Over-published: ..." context. Picking a gap feeds it into the same generation pipeline as angles, so the article explicitly commits to filling that information gap.

