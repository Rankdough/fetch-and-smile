CREATE TABLE public.seed_keyword_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  file_type text NOT NULL DEFAULT 'generic',
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.seed_keyword_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read seed_keyword_files" ON public.seed_keyword_files FOR SELECT USING (true);
CREATE POLICY "Allow public insert seed_keyword_files" ON public.seed_keyword_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete seed_keyword_files" ON public.seed_keyword_files FOR DELETE USING (true);