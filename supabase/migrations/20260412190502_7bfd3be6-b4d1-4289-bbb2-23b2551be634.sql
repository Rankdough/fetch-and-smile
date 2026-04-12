ALTER TABLE public.keyword_clustering_results
ADD COLUMN content_queue_state jsonb DEFAULT '{}'::jsonb;