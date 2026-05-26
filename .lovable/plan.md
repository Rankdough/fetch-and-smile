# Fix source citations once and for all

## The problem (verified in your last sample)
- "**Sources:**" bullet blocks still appear under H2s
- Orphan label text remains where fabricated URLs were stripped
- Model is still improvising citations instead of using context files

## The fix: model writes prose, code attaches sources

The AI model will no longer make any decision about citations. A deterministic post-processor handles 100% of source attachment from a closed allow-list built from your context files.

### 1. Build an Authorised Sources allow-list (generation start)
Extract every URL from context files into a structured list: `{ url, anchorText, snippet, sourceFile }`. This is the **only** universe of URLs the article can ever cite. If context has zero URLs → article has zero citations and no References section. No web fallback, ever.

### 2. Strip all citation instructions from the prompt
Remove every "cite sources", "add Sources:", "link to authority" instruction from the generation prompt. Model writes clean prose with no citation hints. This kills the improvisation at the root.

### 3. Deterministic source attachment (post-generation)
For each H2 section: tokenise heading + body, score every authorised source by snippet/anchor/URL-slug overlap, attach **one inline anchor link** to the best-matching phrase in the body. Rules:
- Max 1 citation per section
- Max 2 uses per URL across the article
- Never emit a "Sources:" block, never a bullet list of URLs, never a bare URL
- If no source scores above threshold → section gets no citation (that's fine)

### 4. Build References section deterministically
At the end, generate `## References` as a numbered list of **anchor text only** (e.g. "1. NHS Orthodontics Guidance") from URLs actually used in the body. If zero URLs were attached → omit the section entirely.

### 5. URL verification
HEAD-check every authorised URL before generation starts. Unreachable URLs are dropped from the allow-list so they can never reach the article.

### 6. Renderer-level safety net
In `markdownToStyledHtml.ts`, blocklist any line matching:
- `**Sources:**` / `Sources:` / `Source:` (as bullet or paragraph)
- Bullet lines that are bare URLs
- Bullet lines that are orphan labels with no link

This catches anything that somehow slips past steps 1–4.

## Files touched
- `supabase/functions/generate-content/index.ts` — build allow-list, strip citation prompts, run attachment pass
- `supabase/functions/regenerate-section/index.ts` — same attachment logic for regenerations
- `src/lib/markdownToStyledHtml.ts` — renderer blocklist
- `src/components/ContentVerification.tsx` — show which authorised sources were used vs unused

## Out of scope
The off-topic `dentaltourismalbania.com` links come from the **Internal Links** pipeline (separate system). Not fixed by this plan — flag separately if you want that addressed too.

## Verification
After implementation I'll generate a fresh sample on the same Invisalign topic and check:
- Zero "Sources:" blocks anywhere
- Zero orphan labels
- References section contains only anchor text, only URLs from context
- Every cited URL returns 200

Approve this and I'll implement it end-to-end, then generate the sample.