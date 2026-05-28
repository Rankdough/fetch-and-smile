-- Add project_id to internal_link_history so link suggestions are scoped
-- per client/deployment and don't bleed across projects.
ALTER TABLE public.internal_link_history
  ADD COLUMN IF NOT EXISTS project_id text;

-- Index for fast per-project lookups.
CREATE INDEX IF NOT EXISTS internal_link_history_project_idx
  ON public.internal_link_history (project_id);
