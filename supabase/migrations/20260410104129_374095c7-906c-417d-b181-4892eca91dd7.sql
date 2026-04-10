CREATE TABLE public.internal_link_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_link_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view internal link history"
ON public.internal_link_history FOR SELECT USING (true);

CREATE POLICY "Anyone can insert internal link history"
ON public.internal_link_history FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete internal link history"
ON public.internal_link_history FOR DELETE USING (true);