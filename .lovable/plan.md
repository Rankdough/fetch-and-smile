

# Fix Humanness Scoring and Add Expert Quote Rule

## What Changes

Two things need to happen:

### 1. Exclude Structural Sections from Humanness Scoring

The scoring system currently analyses the entire article -- including TL;DR, Quick Tips, question headings, FAQ, Final Thoughts, and References. These are mandatory format elements, not prose. Scoring them as "AI patterns" unfairly drags the humanness score down.

**Fix:** Before sending content to the scorer, strip out all structural/format sections so only the actual article prose gets evaluated. The deterministic metrics (vague phrases, AI transitions, sentence variance) will also run on stripped content only.

Sections to exclude:
- TL;DR (the heading and its bullet points)
- Quick Tips (the heading and the 3 tips)
- In This Article (the heading and navigation list)
- FAQ / Frequently Asked Questions (heading and Q&A pairs)
- Final Thoughts (heading and content)
- References (heading and link list)

Additionally:
- Remove the "Be HARSH" anchoring language that pre-biases scores to 40-60
- Tell the scorer explicitly that the article follows a mandated SEO structure, so it should judge humanness purely by prose quality within content sections
- Add a metrics-based score floor: if the deterministic checks pass (low vague phrases, low AI transitions, good sentence variance), humanness cannot score below 55

### 2. Add Expert Quote Rule to Content Generation

Add a new rule to the generation prompt requiring the AI to include at least one quote from a real, named expert or professional relevant to the topic. This makes articles feel more credible and human-authored.

---

## Technical Details

### File 1: `supabase/functions/score-content-quality/index.ts`

**A) Add a content-stripping function** (new helper function) that removes structural sections before analysis:
- Uses regex to strip out sections starting with `## TL;DR`, `## Quick Tips`, `## In This Article`, `## Frequently Asked Questions`, `## FAQ`, `## Final Thoughts`, `## References` (and their content up to the next `##` heading or end of text)
- Both `analyzeHumanness()` and the AI scorer will receive the stripped prose-only content

**B) Update the system prompt** (lines 148-231):
- Replace "Be HARSH but fair. Most AI-generated content scores 40-60. Only truly exceptional content scores 80+." with "Score fairly based on evidence. Use the full 0-100 range."
- Add context before the scoring criteria: "IMPORTANT: This article follows a mandated SEO structure (TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts, References, question-based headings). Structural sections have been removed from the content below. Judge humanness ONLY by the prose quality of the remaining body content."
- Update the humanness rubric to clarify: evaluate prose voice, rhythm, and personality -- not article skeleton

**C) Add a metrics-based humanness floor** (after line 291, in the score calculation):
- If `vaguePer1000 <= 5` AND `aiTransitionsCount <= 3` AND `sentenceLengthStdDev >= 5` AND `repetitiveStarterPct <= 15`, set humanness floor to 55
- If the AI returned a humanness score below the floor, bump it up to the floor value
- This prevents the subjective scorer from contradicting objective evidence

### File 2: `supabase/functions/generate-content/index.ts`

**Add rule 7 to the HUMAN WRITING STYLE block** (after line 227, the British English rule):

```
7. EXPERT QUOTE:
   - Include at least one quote from a real, named expert or professional relevant to the topic
   - Format as a blockquote with attribution: > "Quote text" - Name, Title/Role
   - The person and quote should be real and verifiable, not fabricated
   - Place the quote where it adds credibility or a human perspective to the discussion
```

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/score-content-quality/index.ts` | Strip structural sections before scoring, recalibrate prompt, add metrics-based humanness floor |
| `supabase/functions/generate-content/index.ts` | Add expert quote rule to the HUMAN WRITING STYLE block |

