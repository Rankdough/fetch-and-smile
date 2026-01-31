-- Create table for storing tone of voice profiles
CREATE TABLE public.tone_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  characteristics JSONB NOT NULL DEFAULT '{}',
  summary TEXT,
  example_phrases TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add comment for clarity
COMMENT ON TABLE public.tone_profiles IS 'Stores extracted tone of voice profiles from uploaded documents';

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_tone_profiles_updated_at
BEFORE UPDATE ON public.tone_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();