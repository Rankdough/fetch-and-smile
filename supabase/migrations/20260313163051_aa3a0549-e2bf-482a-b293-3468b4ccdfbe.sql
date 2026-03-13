CREATE TABLE public.keyword_dedup_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_name TEXT,
  original_count INTEGER NOT NULL DEFAULT 0,
  deduplicated_count INTEGER NOT NULL DEFAULT 0,
  removed_count INTEGER NOT NULL DEFAULT 0,
  fuzzy_merged_groups INTEGER NOT NULL DEFAULT 0,
  ai_merged_groups INTEGER NOT NULL DEFAULT 0,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  ungrouped_for_ai JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.keyword_dedup_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to keyword_dedup_results"
ON public.keyword_dedup_results
FOR ALL
USING (true)
WITH CHECK (true);