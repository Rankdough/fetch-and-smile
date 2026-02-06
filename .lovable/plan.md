
# Embed Humanness Rules into Content Generation

## What This Changes

Currently, the humanness checks only run **after** content is generated -- either through the post-generation Quality Analysis scoring panel, or through the 4-stage Human Mode pipeline (Stages 3 and 4). This means the AI first writes in its default style, and then a separate step tries to fix it.

This plan moves the core humanness writing rules directly into the `generate-content` edge function's system prompt. The AI will follow these rules **while writing** the article, producing more human-sounding content from the very first draft -- regardless of whether Human Mode is toggled on or off.

## What You Will See

- When you hit "Generate Content" (in standard mode), the resulting article will already follow humanness rules: varied sentence lengths, no stiff transitions, no vague filler, conversational tone with contractions and rhetorical questions.
- No new UI elements or buttons -- this is a prompt-level change that improves the default output quality.
- The existing Quality Analysis scoring (with the Humanness dimension) and Human Mode pipeline remain available as additional layers if you want even more refinement.

## What Rules Get Added to Generation

The following rules will be appended to the system prompt in the `generate-content` edge function, right after the existing "Content Guidelines" section:

**1. Sentence Rhythm**
- Mix short punchy sentences (5-8 words), medium sentences (10-15 words), and occasional longer explanations (18-25 words)
- Never have 3 or more sentences of similar length in a row

**2. Banned AI Phrases**
- Never use: "Moreover", "Furthermore", "Additionally", "In addition", "Consequently", "Thus", "Hence", "Therefore", "In today's world", "It's important to note", "It goes without saying", "At the end of the day", "In conclusion", "To summarize", "When it comes to", "The reality is"
- Never use vague descriptors: "various", "numerous", "significant", "substantial", "considerable", "plethora", "myriad"
- Never use AI buzzwords: "utilize", "leverage", "delve", "embark", "journey", "landscape", "robust", "streamline", "synergy", "paradigm", "holistic", "cutting-edge", "game-changer"

**3. Specificity Over Vagueness**
- Replace "many people" with specific numbers or groups
- Replace "significant impact" with measurable outcomes
- Replace "can help" with exactly how it helps
- Every claim should have a number, example, or caveat

**4. Conversational Voice**
- Use contractions naturally (it's, don't, won't, you'll)
- Include rhetorical questions to engage the reader
- Add occasional personal observations or asides
- Write as if explaining to a knowledgeable colleague, not lecturing a student

**5. Anti-Pattern Structure**
- Do NOT follow the predictable "intro-point-point-point-conclusion" essay structure
- Vary paragraph lengths (some 1 sentence, some 2-3)
- Start some sections with a question, others with a bold claim, others with a specific example
- Include realistic limitations and caveats alongside benefits

**6. British English** (already partially covered but reinforced)
- Use: optimise, colour, organisation, behaviour, centre, programme
- Not: optimize, color, organization, behavior, center, program

---

## Technical Details

### File: `supabase/functions/generate-content/index.ts`

A new `HUMAN WRITING STYLE` section will be added to the system prompt, inserted between the existing "Content Guidelines" block (ending at line 193) and the knowledge base rules section (starting at line 196). This places it at the end of the core instructions but before any optional/dynamic additions (knowledge base, tone profile, format reference).

The new prompt block will contain all the rules listed above, formatted as clear numbered instructions the model must follow.

No other files are changed. The existing `humanise-rewrite`, `humanise-quality-gate`, and `score-content-quality` functions remain untouched -- they still serve as additional refinement layers when used.
