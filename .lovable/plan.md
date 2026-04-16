

## Calculating the new targets (-20%)

| Style | Current | -20% | New target |
|---|---|---|---|
| Conversational | 12-15 words | 9.6-12 | **10-12 words** |
| Academic/formal | 20-25 words | 16-20 | **16-20 words** |
| Punchy (Hemingway) | 5-8 words | keep | **5-8 words** |

## What I'll set as the active rule

- **Average sentence length: 10-12 words**
- **Hard maximum: 20 words** (down from 25)
- **Mix in punchy sentences: 5-8 words** for rhythm
- **No 3+ sentences of similar length in a row**

## Effect on tone of voice

Honest answer: shortening sentences DOES shift tone slightly. Here's the trade-off:

- **Conversational tone profiles** (warm, casual, friendly) → **gets better**. Shorter sentences = more natural speech rhythm, more like how people actually talk.
- **Expert/authoritative tone profiles** → **slight risk of sounding less authoritative**. Long sentences signal expertise. We mitigate this by keeping the tone profile as the *highest priority* directive (it already overrides default style) and by allowing 16-20 word sentences for complex points when needed.
- **Brand voice with signature long sentences** → could feel clipped. Mitigation: the rule says "average" 10-12, not "every sentence", so the AI can still write a longer sentence when the tone demands it.

Net effect: writing will feel more human and readable across the board, with minimal tone damage because the tone profile block is already marked HIGHEST PRIORITY in the prompts.

## Files I'll change (writing-stage only, nothing else)

1. `supabase/functions/humanise-write-section/index.ts` - main per-section writer
2. `supabase/functions/humanise-rewrite/index.ts` - humanisation pass
3. `supabase/functions/rewrite-intro/index.ts` - migration intros
4. `supabase/functions/generate-content/index.ts` - legacy generator
5. `supabase/functions/migrate-url/index.ts` - migration generator
6. `mem://style/humanness-writing-rules` - persist the rule for future pipelines

## What I will replace

In each prompt, the existing "Vary sentence length" line (e.g. *"mix short (5-8 words), medium (10-15 words), and longer (18-25 words)"*) becomes:

> **SENTENCE LENGTH (strict):**
> - Target average: 10-12 words per sentence
> - Hard maximum: 20 words. If a sentence runs over 20 words, split it.
> - Mix in punchy 5-8 word sentences for rhythm
> - Allow occasional 16-20 word sentences only for complex technical points
> - Never write 3+ sentences of similar length in a row
> - Tone profile takes priority: if the tone demands a longer signature sentence, the tone wins

## Out of scope (won't touch unless you ask)

- Quality Score humanness calculation (no new sentence-length penalty added)
- UI - no slider, no per-article override
- Outline / clustering / classification / scoring functions - they don't write prose
- Any other writing rule (em dashes, banned phrases, perspective, British English) stays exactly as-is

