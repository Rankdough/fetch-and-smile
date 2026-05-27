-- Extend brain_insights with proprietary knowledge schema (all additive, all nullable or with safe defaults)
ALTER TABLE public.brain_insights
  ADD COLUMN IF NOT EXISTS unit_type TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS word_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contributor_id TEXT,
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS parent_unit_id UUID REFERENCES public.brain_insights(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stale_reason TEXT,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;

-- Validation: unit_type must be one of the allowed values
ALTER TABLE public.brain_insights
  DROP CONSTRAINT IF EXISTS brain_insights_unit_type_check;
ALTER TABLE public.brain_insights
  ADD CONSTRAINT brain_insights_unit_type_check
  CHECK (unit_type IN ('case','outcome','failure','tradeoff','contrarian','legacy'));

CREATE INDEX IF NOT EXISTS idx_brain_insights_unit_type ON public.brain_insights(unit_type);
CREATE INDEX IF NOT EXISTS idx_brain_insights_business_type ON public.brain_insights(business_type);
CREATE INDEX IF NOT EXISTS idx_brain_insights_parent_unit_id ON public.brain_insights(parent_unit_id);
CREATE INDEX IF NOT EXISTS idx_brain_insights_is_stale ON public.brain_insights(is_stale);

-- Contradictions table
CREATE TABLE IF NOT EXISTS public.brain_unit_contradictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_a_id UUID NOT NULL REFERENCES public.brain_insights(id) ON DELETE CASCADE,
  unit_b_id UUID NOT NULL REFERENCES public.brain_insights(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT brain_unit_contradictions_status_check CHECK (status IN ('open','context_dependent','one_deprecated')),
  CONSTRAINT brain_unit_contradictions_distinct CHECK (unit_a_id <> unit_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_brain_unit_contradictions_pair
  ON public.brain_unit_contradictions (LEAST(unit_a_id, unit_b_id), GREATEST(unit_a_id, unit_b_id));
CREATE INDEX IF NOT EXISTS idx_brain_unit_contradictions_status ON public.brain_unit_contradictions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_unit_contradictions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_unit_contradictions TO authenticated;
GRANT ALL ON public.brain_unit_contradictions TO service_role;

ALTER TABLE public.brain_unit_contradictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on brain_unit_contradictions"
  ON public.brain_unit_contradictions FOR ALL
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_brain_unit_contradictions_updated_at ON public.brain_unit_contradictions;
CREATE TRIGGER update_brain_unit_contradictions_updated_at
  BEFORE UPDATE ON public.brain_unit_contradictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Proprietary analytics events
CREATE TABLE IF NOT EXISTS public.proprietary_analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID,
  mode TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT proprietary_analytics_events_mode_check CHECK (mode IN ('classic','proprietary'))
);

CREATE INDEX IF NOT EXISTS idx_proprietary_analytics_events_article_id ON public.proprietary_analytics_events(article_id);
CREATE INDEX IF NOT EXISTS idx_proprietary_analytics_events_mode ON public.proprietary_analytics_events(mode);
CREATE INDEX IF NOT EXISTS idx_proprietary_analytics_events_event_type ON public.proprietary_analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_proprietary_analytics_events_created_at ON public.proprietary_analytics_events(created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proprietary_analytics_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proprietary_analytics_events TO authenticated;
GRANT ALL ON public.proprietary_analytics_events TO service_role;

ALTER TABLE public.proprietary_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on proprietary_analytics_events"
  ON public.proprietary_analytics_events FOR ALL
  USING (true) WITH CHECK (true);