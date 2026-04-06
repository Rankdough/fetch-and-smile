
CREATE TABLE public.context_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.context_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on context_topics" ON public.context_topics FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_context_topics_updated_at
  BEFORE UPDATE ON public.context_topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.context_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES public.context_topics(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.context_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on context_documents" ON public.context_documents FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_context_documents_updated_at
  BEFORE UPDATE ON public.context_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
