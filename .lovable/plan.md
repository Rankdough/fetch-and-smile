

## Plan: Add Keyword Research Tool

### Overview
Add a fourth tool tab "Keyword Research" to the app. The user enters a broad topic, optionally adds context, and the AI generates a comprehensive semantic keyword universe organized into categorized clusters. Results are saved to the database for later retrieval.

### Database

**New table: `keyword_research`**
- `id` (uuid, PK, default `gen_random_uuid()`)
- `topic` (text, not null)
- `context` (text, nullable)
- `results` (jsonb, not null) — structured clusters like `{ categories: [{ name: string, terms: string[] }] }`
- `created_at` (timestamptz, default `now()`)
- Public RLS policies (SELECT, INSERT, DELETE) — same pattern as other tables

### Edge Function: `generate-keyword-universe`

**File:** `supabase/functions/generate-keyword-universe/index.ts`

- Accepts `{ topic, context? }` 
- Calls Lovable AI (`google/gemini-3-flash-preview`) with a detailed prompt instructing the model to act as a domain expert and produce 150-300+ terms across 10-15 categories
- Uses tool calling to extract structured JSON output (categories with term arrays)
- Returns the structured result
- Handles 429/402 errors

**Prompt strategy:**
- Exhaustively list sub-categories: equipment, rules, techniques, positions, performance metrics, training, slang/jargon, brands, common questions, long-tail search phrases
- Include niche insider terms that standard keyword tools miss
- Structure as named categories with arrays of terms

### New Page: `src/pages/KeywordResearch.tsx`

**Input section:**
- Topic text input (required)
- Optional context/guidance textarea
- Generate button

**Results section:**
- Collapsible cards per category, each showing a list of terms as badges/chips
- Total term count display
- "Copy All" button (copies all terms as newline-separated list)
- "Export CSV" button (exports with category and term columns)
- Saved research list — shows previously generated keyword universes with ability to load/delete them

### Navigation Changes

**File:** `src/pages/Index.tsx` (lines ~1996-1999)
- Add a new nav button "Keyword Research" after "Product Descriptions" that navigates to `/keyword-research`
- Uses `Search` icon from lucide-react

**File:** `src/App.tsx`
- Add route: `<Route path="/keyword-research" element={<KeywordResearch />} />`

**File:** `supabase/config.toml`
- Add `[functions.generate-keyword-universe]` with `verify_jwt = false`

### Files to create
1. `supabase/functions/generate-keyword-universe/index.ts`
2. `src/pages/KeywordResearch.tsx`

### Files to modify
1. `src/App.tsx` — add route + import
2. `src/pages/Index.tsx` — add nav button

### Database migration
1. Create `keyword_research` table with public RLS policies

