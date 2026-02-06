

# Add "Humanness" Scoring Dimension to Quality Analysis

## What This Changes

Right now, when you click "Score Content," the system evaluates your article on four dimensions: actionability, specificity, uniqueness, and engagement. None of these specifically ask: *"Does this sound like a human wrote it?"*

Meanwhile, your app already has a separate rule-based checker (used internally during Human Mode generation) that catches AI patterns like repetitive sentence starters, vague filler phrases, and stiff transitions like "Moreover" and "Furthermore." But those insights never surface in the Quality Analysis panel you see after generation.

This plan combines both approaches - adding a 5th scoring dimension called **"Humanness"** that uses:
- The existing rule-based pattern detection (hard checks for known AI tells)
- A new AI prompt layer that evaluates subtler qualities like natural rhythm, conversational flow, and authentic voice

## What You Will See

1. A new **"Humanness"** score (0-100) alongside the existing four dimensions in the Quality Analysis grid
2. The overall score will be weighted to make humanness the **most influential factor** (since that is your top priority)
3. When you click "Apply Improvements," any humanness issues will be sent as the highest-priority fix instructions
4. The "Top Strength" and "Critical Fix" will now also consider human-writing quality in their assessment

## How The Scoring Works

The humanness dimension will check for:

**Hard rules (deterministic - caught every time):**
- Repetitive sentence starters (e.g., 15%+ of sentences starting with "This is" or "You can")
- Vague filler phrases per 1,000 words ("various," "numerous," "significant," "can help")
- AI transition words count ("Moreover," "Furthermore," "Additionally")
- Sentence length uniformity (standard deviation below 5 = too robotic)
- Sections missing concrete examples or numbers

**Soft rules (AI-judged nuances):**
- Does it read like someone talking to a colleague, or like a textbook?
- Are there personal observations, opinions, or asides?
- Does the rhythm feel natural - short punchy bits mixed with longer explanations?
- Are there contractions, rhetorical questions, or colloquial touches?
- Does it avoid the "AI essay structure" of intro-point-point-point-conclusion?

---

## Technical Details

### 1. Update the `score-content-quality` edge function

**Add a pre-analysis step** that runs the existing deterministic pattern checks (from the `humanise-quality-gate` logic) before calling the AI. Then pass those metrics into the AI prompt so it has concrete data to work with.

Changes to the system prompt:
- Add a 5th scoring dimension: `humanness` (0-100) with clear rubric
- Include the rule-based metrics (vague phrase count, transition count, sentence variance) as context for the AI
- Weight the overall score formula: humanness counts for 30%, the other four share the remaining 70%
- Update the `topStrength` and `criticalWeakness` prompts to explicitly consider humanness

New rubric for humanness:
- 0-30: Reads like a textbook or corporate memo. Uniform structure, no personality
- 40-60: Competent but detectable as AI. Formal transitions, hedging language
- 70-85: Mostly natural. Some personality, varied rhythm, few AI tells
- 86-100: Indistinguishable from an expert human writer. Has voice, opinions, natural flow

### 2. Update the `QualityScoringPanel` component

- Add `humanness` to the `QualityScores` interface alongside the existing four dimensions
- Add a human-like icon for the new dimension in the score grid
- Update the "Apply Improvements" logic to prioritise humanness fixes (send them first in the instruction list)
- Update the overall score display to reflect the new weighted calculation

### 3. Pass rule-based metrics through the pipeline

Inside the edge function, before calling the AI:
- Run the deterministic checks (reuse the same pattern lists from `humanise-quality-gate`)
- Include the results as structured context in the user prompt: "This content has X vague phrases, Y AI transitions, Z% repetitive starters, sentence length std dev of N"
- This gives the AI concrete evidence rather than asking it to guess

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/score-content-quality/index.ts` | Add deterministic pre-analysis, new humanness dimension in prompt, weighted overall score |
| `src/components/QualityScoringPanel.tsx` | Add humanness to interface, grid, and improvement priority logic |

No other files are changed.

