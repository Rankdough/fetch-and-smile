ALTER TABLE public.brain_insights
ADD COLUMN IF NOT EXISTS is_bookmarked boolean NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS update_brain_insights_updated_at ON public.brain_insights;

CREATE TRIGGER update_brain_insights_updated_at
BEFORE UPDATE ON public.brain_insights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();