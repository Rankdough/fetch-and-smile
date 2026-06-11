# fetch-and-smile — CLAUDE.md
# Read this at the start of every session before touching any code.
# Last updated: 2026-06-09

## PROJECT
Shopify SEO/AEO content platform.
Clients: BigLeagueShirts, ProPlayerTeam, TrackBarn, Dental Tourism Albania.
Stack: React/TS (Lovable frontend), Supabase edge functions (Deno), Gemini.
Repo: github.com/Rankdough/fetch-and-smile
Branch: fix/a1-tldr
GitHub token: stored in session memory — ask Roman if missing.

---

## DEPLOYMENT CHAIN
1. Commit to GitHub branch fix/a1-tldr
2. Give Lovable the exact curl command(s) and deploy instruction
3. Lovable confirms boot log marker(s)
4. Re-upload any context file if parse-context-file was redeployed
5. Generate one test article and check output against the rule checklist
6. Only then declare a fix done

CRITICAL: Lovable auto-syncs from GitHub. Any fix that exists only in
Lovable's working tree (not committed to GitHub) will be silently
overwritten the next time a sync event occurs. Every fix must be
committed to GitHub before the session ends.

---

## CURRENT DEPLOYED MARKERS
Confirm these in boot log before assuming a fix is live.

| Function | Commit | Marker |
|---|---|---|
| proprietary-generate-article | 08bfb53b3c | BUILD-2026-06-09-B2-decimal-nav |
| apply-format | 1c273512a7 | BUILD-2026-06-09-B2-cta-fix |
| parse-context-file | 26242621ba | BUILD-2026-06-09-A9-pairing |
| insert-internal-links | 4304a9d42a | no marker (deploy success only) |

---

## KEY FILES
| File | Lines | Purpose |
|---|---|---|
| supabase/functions/proprietary-generate-article/index.ts | ~2810 | Core article generator — 43 of 54 rules live here |
| supabase/functions/apply-format/index.ts | 410 | CTAs, formatting post-process |
| supabase/functions/insert-internal-links/index.ts | 304 | Internal link rules |
| supabase/functions/parse-context-file/index.ts | ~237 | Docx parser — extracts URLs from Word hyperlinks |
| src/pages/Index.tsx | ~6649 | Frontend — schema wrapping, trust box, FAQ accordion |
| src/components/keyword-research/ContentQueue.tsx | ~1100 | Content queue UI |
| src/components/keyword-research/KeywordClustering.tsx | ~900 | Keyword clustering + sendToGenerator |
| src/lib/deepResearchPrompt.ts | 178 | Gemini deep research prompt builder |

---

## PIPELINE LAYERS (reference pipeline order)
1. parse-context-file — extracts text + hyperlink URLs from uploaded docx
2. extractContextFileReferences (proprietary) — finds [title](url) pairs
3. dedupeAndValidateRefs (proprietary) — dedupes by host+path, validates https
4. refsToMarkdown (proprietary) — numbered list, UTF-8-safe titles
5. injectReferences (proprietary) — injects ## References section at end

RULE: Before touching any reference bug, read ALL FIVE layers in full.
A fix at layer 3 is invisible if layer 1 returns empty.

---

## WORKING RULES

### Before every fix
1. Read CLAUDE.md (this file)
2. Read the last 5 commits: GET /repos/Rankdough/fetch-and-smile/commits?sha=fix/a1-tldr&per_page=5
3. Read the FULL function being changed — not just the lines around the bug
4. For pipeline bugs: read the FULL pipeline end to end before touching anything
5. Verify the anchor string exists EXACTLY ONCE before committing (assert count == 1)

### Every commit must
- Bump BUILD_MARKER with today's date and a short descriptor
- Include a console.log(BUILD_MARKER) at the serve() entry point
- Pass all assert statements before the PUT request is made
- Have a clear commit message describing the exact change and why

### After every deploy
- Confirm BUILD_MARKER appears in boot log
- Generate one test article
- Check output against the rule checklist below
- Update CLAUDE.md markers table

### End of session checklist
- [ ] All fixes discussed → committed or explicitly deferred with a note here
- [ ] All commits → deployed and boot log markers confirmed
- [ ] One test article generated and checked against rule checklist
- [ ] GitHub and Lovable confirmed in sync (no Lovable-only changes)
- [ ] CLAUDE.md updated with current markers and fix queue state

---

## FIX QUEUE

### Committed and deployed (confirmed working)
- A7: SKIP_HOSTS / PRODUCT_URL_RE removed from context-file extraction
- A8: numbered references, UTF-8-safe titles, title dedupe, accessed suffix stripped
- A9: per-hyperlink URL pairing in parse-context-file (each [title](url) paired individually)
- B1: F.U.S.E. abbreviation collapse, section bleed strip, inline source fragments, Quick Tips count guard
- B2: decimal repair (0. 4 → 0.4), nav snippet ### strip, CTA template hole fix

### Committed, awaiting deploy confirmation
- B2 on proprietary (08bfb53b3c) — boot log not yet confirmed by Roman
- B2 on apply-format (1c273512a7) — boot log not yet confirmed by Roman

### Known broken — not yet committed
- FAQ Q4/Q5 boilerplate — FAQAccordion.tsx buildFallbackFaqItems generates generic
  "What is the main point of..." fallback. Fix: derive Q4/Q5 from article H2 headings.
  File: src/pages/FAQAccordion.tsx or src/components/FAQAccordion.tsx (confirm path)
- How to Choose section absent — topicNoun() returns generic "Option" for unrecognised
  topics. Fix: fall back to first 3-4 words of topic string when topicNoun()="Option"
- CTA minimum not enforced — apply-format enforces max 2 but not min 2. When model
  generates 1 CTA, no top-up logic fires. Fix: inject second CTA if count < 2.
- TL;DR two-box rendering — H2 and P are styled independently in markdownToStyledHtml.
  Fix: wrap TL;DR H2 + P in a single container div before styling.
- Orphan citation brackets — "[" appears at start of sentences when citation bracket
  falls at sentence split point. Fix: post-stitch strip orphan "[" at paragraph start.
- References sometimes missing — check splitTrailingReferencesSection ordering.
  May be overwriting injected references if called after injectReferences.
- Author byline duplicated (intermittent) — edge function emits author markup AND
  Index.tsx injects trust box. One injection point needs to be suppressed.
- Empty H3 (intermittent) — H3 heading lands as only content between paragraph splits.
- Broken emoji in CTA (intermittent) — 4-byte emoji sliced mid-codepoint in CTA headline.

---

## RULE CHECKLIST (run against every generated article)
Copy this and mark each line when testing:

STRUCTURE
[ ] AEO section order correct (Opening→Trust→TL;DR→QuickTips→Nav→H2s→Failure→HowToChoose→FAQ→FinalThoughts→Refs)
[ ] 4 H2 question sections present
[ ] Failure mode H2 present (not wrapped in schema)
[ ] How to Choose section present
[ ] Quick Tips has 3 items (not empty heading)
[ ] FAQ has 5 real pairs (not Q4/Q5 boilerplate)
[ ] Final Thoughts has 2 paragraphs
[ ] References section present with clickable links

CONTENT QUALITY
[ ] TL;DR is ONE paragraph (not split into 2-3 blocks)
[ ] No "F. U. S. E." or "0. 4" splits (abbreviation/decimal protection working)
[ ] No raw ### headings in In This Article nav previews
[ ] No "This data was compiled from X.docx" in body
[ ] No "with our ." or "for your ." in CTAs
[ ] No id="direct-answer" visible as text
[ ] Exactly 2 CTAs present
[ ] All CTA copy is topic-specific (no generic text)

REFERENCES
[ ] Boot log: "REFERENCES: extracted N > 0"
[ ] References section has numbered list with real clickable links
[ ] No duplicate entries (same paper on PMC + PubMed)
[ ] No truncated titles

SCHEMA / SEO
[ ] Question H2s wrapped in schema.org/Question
[ ] Trust box present with author, editorial policy, last reviewed
[ ] In This Article nav present with correct section count
[ ] Direct answer first paragraph has id="direct-answer"

---

## COMMON MISTAKES TO AVOID
1. Never read just the lines around a bug — read the full function
2. Never fix a pipeline layer without reading all layers first
3. Never commit without verifying the anchor exists exactly once
4. Never declare a fix done based on boot log alone — check article output
5. Never leave a session with Lovable-only changes not pushed to GitHub
6. Never skip bumping BUILD_MARKER — without it we cannot verify what is live
7. Never fix the wrong layer — check which layer the data actually fails in first

---

## THE FIX PROTOCOL — mandatory for every single fix

Never skip a step. Never declare a fix done without completing all 8 steps.

### Step 1 — Read the broken output first
Before writing any code, find the broken article that demonstrates the bug.
It will have been pasted in the conversation or in a previous session.
Read the exact broken HTML. Find the exact character sequence that is wrong.
Copy it out literally. Do not assume what it looks like. Do not paraphrase it.

### Step 2 — State the exact broken pattern
Write it out before touching any code:
"The model produces exactly this: [paste exact broken string]"
If you cannot state the exact broken string, you are not ready to write the fix.

### Step 3 — State the exact expected output
Write out what the string should become:
"It should become exactly this: [paste expected fixed string]"

### Step 4 — Write the fix against the real strings from steps 2 and 3
Not against what you think the model produces.
Against what it actually produced in the broken article.

### Step 5 — Test the fix mentally against the real broken string
Does the fix actually match the string from step 2?
Walk through it character by character if needed.
If there is any doubt, do not commit.

### Step 6 — Commit

### Step 7 — Verify with the exact article that exposed the bug
Not any article. The exact topic that showed the bug.
Confirm the exact broken string from step 2 no longer appears in the output.

### Step 8 — Only then say it is fixed
Never say "fixed" or "done" after a commit.
Only say "committed — needs verification."
Only say "fixed" after step 7 confirms the broken string is gone.

---
