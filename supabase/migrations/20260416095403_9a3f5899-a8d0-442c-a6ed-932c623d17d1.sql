ALTER TABLE public.brain_strategy
  ADD COLUMN last_change_summary text,
  ADD COLUMN last_contributing_file_id uuid;