DROP FUNCTION IF EXISTS public.match_brain_chunks(vector, integer, uuid);

CREATE OR REPLACE FUNCTION public.match_brain_chunks(
  query_embedding vector,
  match_count integer,
  p_project_id text
)
RETURNS TABLE(
  id uuid,
  brain_file_id uuid,
  context_document_id uuid,
  content text,
  chunk_index integer,
  similarity double precision
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.brain_file_id,
    c.context_document_id,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.brain_chunks c
  WHERE p_project_id IS NULL OR c.project_id = p_project_id OR c.project_id IS NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$function$;

GRANT EXECUTE ON FUNCTION public.match_brain_chunks(vector, integer, text) TO anon, authenticated, service_role;