CREATE TABLE public.instruction_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.instruction_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read instruction_presets" ON public.instruction_presets FOR SELECT USING (true);
CREATE POLICY "Allow public insert instruction_presets" ON public.instruction_presets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update instruction_presets" ON public.instruction_presets FOR UPDATE USING (true);
CREATE POLICY "Allow public delete instruction_presets" ON public.instruction_presets FOR DELETE USING (true);