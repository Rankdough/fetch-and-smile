CREATE TABLE public.keyword_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT NOT NULL,
  context TEXT,
  results JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.keyword_research ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read keyword_research" ON public.keyword_research FOR SELECT USING (true);
CREATE POLICY "Allow public insert keyword_research" ON public.keyword_research FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete keyword_research" ON public.keyword_research FOR DELETE USING (true);