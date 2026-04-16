-- Add status and credibility columns to brain_insights
ALTER TABLE public.brain_insights 
ADD COLUMN status text NOT NULL DEFAULT 'approved',
ADD COLUMN credibility_flag text DEFAULT NULL,
ADD COLUMN credibility_note text DEFAULT NULL;

-- Existing insights remain 'approved', new ones will be 'pending_review'