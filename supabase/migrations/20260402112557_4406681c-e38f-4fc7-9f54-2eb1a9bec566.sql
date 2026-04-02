CREATE POLICY "Allow public update keyword_research"
ON public.keyword_research
FOR UPDATE
USING (true);