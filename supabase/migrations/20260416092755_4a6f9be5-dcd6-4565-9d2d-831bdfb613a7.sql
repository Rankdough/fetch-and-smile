
-- Cross-references between insights
CREATE TABLE public.brain_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_insight_id UUID NOT NULL REFERENCES public.brain_insights(id) ON DELETE CASCADE,
  related_insight_id UUID NOT NULL REFERENCES public.brain_insights(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'related',
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (source_insight_id, related_insight_id)
);

ALTER TABLE public.brain_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on brain_connections"
  ON public.brain_connections FOR ALL
  USING (true) WITH CHECK (true);

-- Evolving strategy document
CREATE TABLE public.brain_strategy (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  knowledge_gaps TEXT[] DEFAULT '{}',
  key_patterns TEXT[] DEFAULT '{}',
  contributing_file_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_strategy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on brain_strategy"
  ON public.brain_strategy FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_brain_strategy_updated_at
  BEFORE UPDATE ON public.brain_strategy
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
