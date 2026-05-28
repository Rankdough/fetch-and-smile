-- Add project_id filter support to match_brain_chunks.
-- When p_project_id is supplied, only rows with that project_id are returned
-- (NULL-project_id rows are excluded, enabling strict per-client isolation).
-- When p_project_id is omitted or NULL, all chunks are returned (legacy behaviour).

CREATE OR REPLACE FUNCTION public.match_brain_chunks(
  query_embedding vector(1536),
  match_count integer DEFAULT 3,
  p_project_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  brain_file_id uuid,
  context_document_id uuid,
  content text,
  chunk_index integer,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.brain_file_id,
    c.context_document_id,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.brain_chunks c
  WHERE p_project_id IS NULL OR c.project_id = p_project_id
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
