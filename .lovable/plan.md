

# SEO Brain — Strategic Improvements

## Assessment Summary

The current system is a solid V1: upload → extract → review → query. But to function as a proper SEO knowledge engine for client work, it needs five upgrades ranked by impact.

## Proposed Improvements (Priority Order)

### 1. Source Authority Weighting
Add a `source_weight` field to `brain_files` (e.g., "official" / "industry" / "opinion" / "anecdotal"). Display this in the Library. When Ask Brain retrieves insights, weight official sources higher in the context window.

- **Files**: `brain_files` table (migration), `BrainLibrary.tsx` (UI dropdown), `ask-brain/index.ts` (weighted scoring)
- **Effort**: Small

### 2. Contradiction Detection
Extend the cross-reference function to explicitly look for contradictions, not just connections. Add a `relationship_type` of "contradicts" to `brain_connections`. Surface contradictions prominently in the Library and Insights pages so you can resolve them.

- **Files**: `cross-reference-insights/index.ts` (prompt update), `BrainLibrary.tsx` or `BrainInsights.tsx` (UI)
- **Effort**: Small

### 3. Connect Brain to Content Generation
When generating articles, automatically pull approved Brain insights relevant to the topic/keywords and inject them as additional context for the content generator. This makes the Brain *actively useful* rather than a passive reference.

- **Files**: `generate-content/index.ts` (fetch and inject relevant insights), possibly the main generator UI to show which insights were used
- **Effort**: Medium

### 4. Date Awareness & Decay
Add an optional `published_date` to brain files and a `superseded_by` field to insights. Auto-flag insights older than 18 months for re-review. When Ask Brain retrieves context, prefer newer sources.

- **Files**: `brain_files` and `brain_insights` tables (migration), `analyze-brain-file/index.ts` (extract date if available), `ask-brain/index.ts` (recency weighting)
- **Effort**: Medium

### 5. Semantic Search (Embeddings)
Replace keyword matching in Ask Brain with vector embeddings for proper semantic retrieval. This is the biggest technical lift but the highest long-term value — it means asking "how to handle keyword cannibalisation" will find insights about "consolidating competing pages" even without keyword overlap.

- **Files**: New migration (embedding column), `analyze-brain-file/index.ts` (generate embeddings on insert), `ask-brain/index.ts` (vector similarity search)
- **Effort**: Large — requires embedding generation and pgvector

## No Database Changes Yet
This is a strategic assessment. Implementation would happen one improvement at a time after you choose which to prioritise.

## Recommendation
Start with **#1 (Source Weighting)** and **#2 (Contradiction Detection)** — they're small changes with immediate practical value. Then move to **#3 (Brain → Content pipeline)** which is where the real ROI lives.

