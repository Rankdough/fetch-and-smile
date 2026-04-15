
-- Brain files: uploaded documents
CREATE TABLE public.brain_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'text',
  status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on brain_files" ON public.brain_files
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_brain_files_updated_at
  BEFORE UPDATE ON public.brain_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Brain insights: extracted knowledge
CREATE TABLE public.brain_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  insight_type TEXT NOT NULL DEFAULT 'principle',
  summary TEXT,
  full_text TEXT,
  source_file_id UUID REFERENCES public.brain_files(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on brain_insights" ON public.brain_insights
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_brain_insights_updated_at
  BEFORE UPDATE ON public.brain_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Brain tags
CREATE TABLE public.brain_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  tag_type TEXT NOT NULL DEFAULT 'topic',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on brain_tags" ON public.brain_tags
  FOR ALL USING (true) WITH CHECK (true);

-- Junction table
CREATE TABLE public.brain_insight_tags (
  insight_id UUID NOT NULL REFERENCES public.brain_insights(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.brain_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (insight_id, tag_id)
);

ALTER TABLE public.brain_insight_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on brain_insight_tags" ON public.brain_insight_tags
  FOR ALL USING (true) WITH CHECK (true);

-- Brain outputs: saved generated answers
CREATE TABLE public.brain_outputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  output_type TEXT NOT NULL DEFAULT 'answer',
  generated_text TEXT NOT NULL,
  insight_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on brain_outputs" ON public.brain_outputs
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_brain_outputs_updated_at
  BEFORE UPDATE ON public.brain_outputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for brain files
INSERT INTO storage.buckets (id, name, public) VALUES ('brain-files', 'brain-files', false);

CREATE POLICY "Allow public read brain-files" ON storage.objects
  FOR SELECT USING (bucket_id = 'brain-files');

CREATE POLICY "Allow public upload brain-files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'brain-files');

CREATE POLICY "Allow public delete brain-files" ON storage.objects
  FOR DELETE USING (bucket_id = 'brain-files');
