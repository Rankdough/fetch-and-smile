CREATE TABLE public.keyword_clustering_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  input_keywords TEXT[] NOT NULL DEFAULT '{}',
  result JSONB NOT NULL,
  name TEXT
);

ALTER TABLE public.keyword_clustering_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access to clustering results" ON public.keyword_clustering_results
  FOR ALL USING (true) WITH CHECK (true);