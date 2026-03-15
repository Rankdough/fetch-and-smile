CREATE TABLE public.internal_link_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_link_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read internal_link_files" ON public.internal_link_files FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert internal_link_files" ON public.internal_link_files FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public delete internal_link_files" ON public.internal_link_files FOR DELETE TO public USING (true);