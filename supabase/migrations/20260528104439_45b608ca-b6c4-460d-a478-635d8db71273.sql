
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.brain_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_file_id uuid REFERENCES public.brain_files(id) ON DELETE CASCADE,
  context_document_id uuid REFERENCES public.context_documents(id) ON DELETE CASCADE,
  project_id text,
  content text NOT NULL,
  chunk_index integer NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brain_chunks_source_check CHECK (
    (brain_file_id IS NOT NULL) OR (context_document_id IS NOT NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_chunks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_chunks TO authenticated;
GRANT ALL ON public.brain_chunks TO service_role;

ALTER TABLE public.brain_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on brain_chunks"
  ON public.brain_chunks FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX brain_chunks_brain_file_idx ON public.brain_chunks(brain_file_id);
CREATE INDEX brain_chunks_context_document_idx ON public.brain_chunks(context_document_id);
CREATE INDEX brain_chunks_embedding_idx
  ON public.brain_chunks USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_brain_chunks(
  query_embedding vector(1536),
  match_count integer DEFAULT 3
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
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
