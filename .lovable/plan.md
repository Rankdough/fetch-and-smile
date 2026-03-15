

# Plan: Implement Three AEO Content Optimisations

Based on your earlier analysis notes, three changes are needed across the generation prompts:

---

## 1. Change TL;DR to AI-Quotable Paragraph(s)

**Current**: TL;DR is generated as bullet points (3-5 items).

**Change**: Replace bullet-point TL;DR instructions with a dense, factual paragraph format optimised for AI models to quote verbatim. Should include specific names, numbers, prices, and a clear "best for X" recommendation.

**Files to edit**:
- `supabase/functions/generate-content/index.ts` — line ~164: change the TL;DR structure instruction from bullet points to 1-2 dense paragraphs with specifics
- `supabase/functions/apply-format/index.ts` — lines ~86-96: update the TL;DR format instruction for the post-processing step
- `src/pages/ContentMigration.tsx` — line ~374: update the migration reformat instructions to use paragraph-style TL;DR

---

## 2. Rename "Which Option Should You Choose?" to "How to Choose" Decision Guide

**Current**: Section 7 in article structure is `## Which Option Should You Choose?`

**Change**: Replace with `## How to Choose` formatted as a practical checklist (4-6 decision criteria as bullet points), not a pros/cons split.

**Files to edit**:
- `supabase/functions/generate-content/index.ts` — line ~197: rename section and update format instructions to use checklist-style criteria
- `supabase/functions/generate-outline/index.ts` — line ~176: update outline template
- `supabase/functions/generate-standalone-outline/index.ts` — line ~62: update outline template
- `src/pages/ContentMigration.tsx` — line ~389: update migration instructions
- `src/pages/Index.tsx` — line ~131: update the example article (cosmetic only)

---

## 3. AI-Quotable Opening Paragraph (Layer 2)

**Current**: The first paragraph after H1 answers the title question in 30-50 words with facts and brand names. The `rewrite-intro` edge function ensures uniqueness from the subtitle.

**Change**: Enhance the opening paragraph instructions to be explicitly **AI-quotable** — a standalone, factual statement that an AI assistant could use as its entire recommendation. Must include specific names, numbers/prices, and a clear verdict. Update both the generation prompt and the rewrite-intro function.

**Files to edit**:
- `supabase/functions/generate-content/index.ts` — line ~131: strengthen the H1 intro instruction to emphasise AI-quotability (standalone factual statement with specifics)
- `supabase/functions/rewrite-intro/index.ts` — update the system/user prompt to generate an AI-quotable paragraph (standalone, factual, includes specifics)
- `src/pages/ContentMigration.tsx` — line ~378: update migration H1 intro instructions similarly

---

## Summary of Scope

| Change | Files affected |
|---|---|
| AI-quotable TL;DR paragraphs | generate-content, apply-format, ContentMigration |
| "How to Choose" decision guide | generate-content, generate-outline, generate-standalone-outline, ContentMigration, Index |
| AI-quotable opening paragraph | generate-content, rewrite-intro, ContentMigration |

No database changes. No new edge functions. Prompt-only modifications across existing files.

