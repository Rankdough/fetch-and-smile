-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table to store parsed knowledge content
CREATE TABLE public.seo_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  key_rules TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS but allow public access (no auth required for this tool)
ALTER TABLE public.seo_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to seo_knowledge"
ON public.seo_knowledge FOR SELECT
USING (true);

CREATE POLICY "Allow public insert to seo_knowledge"
ON public.seo_knowledge FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update to seo_knowledge"
ON public.seo_knowledge FOR UPDATE
USING (true);

CREATE POLICY "Allow public delete to seo_knowledge"
ON public.seo_knowledge FOR DELETE
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_seo_knowledge_updated_at
BEFORE UPDATE ON public.seo_knowledge
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();