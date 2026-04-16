ALTER TABLE public.brain_strategy
  ADD COLUMN IF NOT EXISTS locked_principles text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS locked_tactics text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS strategy_snapshot text DEFAULT '';