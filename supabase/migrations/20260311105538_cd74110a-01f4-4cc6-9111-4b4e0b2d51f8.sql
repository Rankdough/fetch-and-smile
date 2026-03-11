
CREATE TABLE public.migration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  url text NOT NULL,
  type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  error text,
  result jsonb
);

ALTER TABLE public.migration_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select migration_jobs" ON public.migration_jobs FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert migration_jobs" ON public.migration_jobs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update migration_jobs" ON public.migration_jobs FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public delete migration_jobs" ON public.migration_jobs FOR DELETE TO public USING (true);

CREATE TRIGGER update_migration_jobs_updated_at
  BEFORE UPDATE ON public.migration_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
