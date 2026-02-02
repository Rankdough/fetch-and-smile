
# Plan: Implement Multi-Stage "Human-Like" Content Generation Pipeline

## Overview

Transform the current single-pass content generation into a **4-stage pipeline** that produces more human-like writing by enforcing specific quality traits: clear intent, natural rhythm, concrete specificity, and consistency with your house style.

## What I Need From You

Before I begin coding, I need a few things:

1. **Your current system prompt / SEO rules** - The existing knowledge base rules are being loaded, but I'd like to see the full text of your SEO instruction document(s) to incorporate your specific style requirements.

2. **Sample of YOUR writing** (optional but helpful) - If you have 1-2 articles you've written manually that represent your ideal style, I can extract patterns from them.

3. **List of banned words/phrases** - Beyond em dashes, what other AI-isms do you want to flag? (e.g., "In today's world", "It's important to note", "various", "numerous", "in conclusion", "Moreover", "Additionally")

## Architecture: The 4-Stage Pipeline

```text
+------------------+     +---------------------+     +-------------------+     +------------------+
|  STAGE 1: BRIEF  | --> | STAGE 2: SECTIONS   | --> | STAGE 3: HUMANISE | --> | STAGE 4: GATE    |
|  (Structure Plan)|     | (Atomic Writing)    |     | (Style Rewrite)   |     | (Quality Check)  |
+------------------+     +---------------------+     +-------------------+     +------------------+
        |                         |                         |                        |
   Creates outline           Writes each H2             Applies cadence          Scores for AI
   with purpose per          section separately         rules, removes           artefacts, fails
   section                   with specific goals        generic patterns         if score < threshold
```

### Stage 1: CREATE_BRIEF

**Purpose**: Forces the AI to plan BEFORE writing, preventing the "meandering AI essay" problem.

**Input**: Topic, value promise, gap analysis, context files, unique angles

**Output** (structured JSON):
```json
{
  "audience": "UK adults considering cosmetic dentistry",
  "intent": "Help reader decide between bonding vs veneers",
  "angle": "Focus on reversibility and long-term cost, not just upfront price",
  "keyClaims": [
    { "claim": "Bonding lasts 5-8 years", "source": "context-file-1.pdf" },
    { "claim": "Veneers are permanent", "source": "NHS guidelines" }
  ],
  "sections": [
    { "h2": "What is Composite Bonding?", "purpose": "Define the procedure and set expectations", "mustInclude": ["single visit", "no anesthesia", "reversible"] },
    { "h2": "Cost Breakdown", "purpose": "Give exact UK prices so reader can budget", "mustInclude": ["per-tooth pricing", "NHS vs private"] }
  ]
}
```

**Why this helps**: The model can't ramble if it has a checklist per section.

---

### Stage 2: WRITE_SECTIONS (Atomic)

**Purpose**: Write each H2/H3 as a standalone 100-300 word block, following its purpose from the brief.

**Rules per section**:
- First sentence = direct answer (no lead-in)
- 2-4 supporting facts
- 1 concrete example (scenario, numbers, brand, tool)
- 1 caveat ("works best when...", "avoid if...")

**Why this helps**: Removes the repetitive "LLM essay voice" that comes from generating 2000+ words in one go.

---

### Stage 3: HUMANISE_REWRITE

**Purpose**: Apply specific style transformations that break AI patterns.

**Transformation rules**:
| Rule | Before (AI) | After (Human) |
|------|-------------|---------------|
| Vary sentence length | All 15-20 words | Mix of 5, 12, 22 words |
| Kill generic openers | "In today's world..." | "Most people assume..." |
| Add constraints | "This is good" | "This works if you have X. Avoid if Y." |
| Remove over-signposting | "Additionally, moreover, furthermore" | Direct statements |
| British English | "optimize, color" | "optimise, colour" |
| No em dashes | "this - like so - works" | "this, like so, works" |

**Implementation**: A single AI call that receives the draft + your style rules + a checklist, outputs revised draft + "changes made" log.

---

### Stage 4: QUALITY_GATE

**Purpose**: Objective rejection criteria - fails the draft if it reads too "AI".

**Checks**:
| Check | Threshold | Action if Failed |
|-------|-----------|------------------|
| % sentences starting with same pattern | < 15% | Send back to Stage 3 |
| Count of vague phrases | < 5 per 1000 words | Highlight and fix |
| Paragraph length uniformity | Variance > 2 sentences | Rebalance |
| Specific examples per section | >= 1 | Add example |
| Numbers/data per section | >= 1 | Add stat |

**Output**:
```json
{
  "score": 72,
  "passed": false,
  "issues": [
    { "type": "repetitive_opener", "count": 8, "fix": "Vary sentence starters" },
    { "type": "missing_example", "sections": ["Cost Breakdown"], "fix": "Add specific UK clinic price" }
  ]
}
```

**Why this helps**: The existing "Quality Scoring Panel" does this AFTER generation. Moving it INTO the pipeline means bad drafts never reach you.

---

## Implementation Details

### New Edge Functions to Create

| Function | Purpose | Credits Est. |
|----------|---------|--------------|
| `humanise-create-brief` | Stage 1: Generate structured brief | ~2 |
| `humanise-write-section` | Stage 2: Write single section | ~1 per section |
| `humanise-rewrite` | Stage 3: Apply style transformations | ~3 |
| `humanise-quality-gate` | Stage 4: Score and validate | ~2 |

### Modifications to `generate-content/index.ts`

Replace single AI call with orchestrated pipeline:

```typescript
// Stage 1: Create brief
const brief = await createBrief({ topic, valuePromise, gapAnalysis, contextFiles, uniqueAngles });

// Stage 2: Write sections atomically
const sections = [];
for (const section of brief.sections) {
  const content = await writeSection({ section, brief, toneProfile });
  sections.push(content);
}

// Assemble draft
let draft = assembleDraft(sections, brief);

// Stage 3: Humanise rewrite
draft = await humaniseRewrite({ draft, styleRules: knowledgeRules, bannedPhrases });

// Stage 4: Quality gate (with retry loop)
let attempts = 0;
let gateResult = await qualityGate({ draft, valuePromise });

while (!gateResult.passed && attempts < 2) {
  draft = await humaniseRewrite({ draft, issues: gateResult.issues });
  gateResult = await qualityGate({ draft, valuePromise });
  attempts++;
}

return draft;
```

### UI Changes to `src/pages/Index.tsx`

1. **Progress indicator**: Show which stage is running during generation
2. **Pipeline toggle**: Option to use "Quick" (current single-pass) vs "Human" (4-stage) mode
3. **Stage visibility**: Optional advanced view showing brief, section drafts, rewrite log

### New UI Component: Generation Progress

```text
+------------------------------------------+
|  Generating Human-Like Content           |
|  [=====>                    ] 35%        |
|                                          |
|  [x] Stage 1: Brief created              |
|  [x] Stage 2: Section 1/5 written        |
|  [ ] Stage 2: Section 2/5 writing...     |
|  [ ] Stage 3: Style rewrite              |
|  [ ] Stage 4: Quality gate               |
+------------------------------------------+
```

---

## Credit Estimation

| Mode | Stages | Est. Credits | Time |
|------|--------|--------------|------|
| Quick (current) | 1 | ~4-6 | 10-15s |
| Human (4-stage) | 4-6 calls | ~12-18 | 30-45s |

The "Human" mode costs ~3x more but should produce significantly better first drafts, reducing manual editing time.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/humanise-create-brief/index.ts` | Create | Stage 1 edge function |
| `supabase/functions/humanise-write-section/index.ts` | Create | Stage 2 edge function |
| `supabase/functions/humanise-rewrite/index.ts` | Create | Stage 3 edge function |
| `supabase/functions/humanise-quality-gate/index.ts` | Create | Stage 4 edge function |
| `supabase/functions/generate-content/index.ts` | Modify | Add pipeline orchestration mode |
| `src/pages/Index.tsx` | Modify | Add toggle, progress indicator |
| `src/components/GenerationProgress.tsx` | Create | Real-time stage progress |
| `src/hooks/useCreditTracking.ts` | Modify | Add estimates for new stages |
| `supabase/config.toml` | Modify | Register new functions |

---

## Questions Before Implementation

1. **Banned words list**: Can you provide your full list of phrases to detect/remove?

2. **British English enforcement**: Should I auto-convert American spellings? (e.g., "optimize" -> "optimise")

3. **Retry behavior**: If the quality gate fails twice, should I:
   - (A) Return the best draft with warnings, or
   - (B) Fail completely and ask you to adjust inputs?

4. **Credit budget**: Is ~15 credits per article acceptable for higher quality output?

5. **Speed priority**: Would you prefer:
   - (A) Parallel section writing (faster, but uses more concurrent API calls), or
   - (B) Sequential writing (slower, but more predictable credit usage)?

---

## Expected Outcomes

After implementation:
- **70-80% reduction in AI-isms** (repetitive openers, vague claims, uniform structure)
- **Every section has a specific purpose** (no filler paragraphs)
- **Measurable quality scores** built into generation, not just post-hoc
- **Consistent house style** enforced automatically

