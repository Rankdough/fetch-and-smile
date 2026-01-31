-- Enable RLS on tone_profiles
ALTER TABLE public.tone_profiles ENABLE ROW LEVEL SECURITY;

-- Allow public read access to tone_profiles
CREATE POLICY "Allow public read access to tone_profiles" 
ON public.tone_profiles 
FOR SELECT 
USING (true);

-- Allow public insert to tone_profiles
CREATE POLICY "Allow public insert to tone_profiles" 
ON public.tone_profiles 
FOR INSERT 
WITH CHECK (true);

-- Allow public update to tone_profiles
CREATE POLICY "Allow public update to tone_profiles" 
ON public.tone_profiles 
FOR UPDATE 
USING (true);

-- Allow public delete to tone_profiles
CREATE POLICY "Allow public delete to tone_profiles" 
ON public.tone_profiles 
FOR DELETE 
USING (true);