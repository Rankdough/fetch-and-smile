
-- Create saved_articles table to store generated articles with all settings
CREATE TABLE public.saved_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  generated_content TEXT NOT NULL,
  original_content TEXT,
  
  -- All settings (1-9)
  value_promise TEXT,
  gap_analysis TEXT,
  format_reference TEXT,
  outline TEXT,
  instructions TEXT,
  keywords TEXT[] DEFAULT '{}',
  target_length TEXT DEFAULT 'medium',
  competitor_urls TEXT[] DEFAULT '{}',
  selected_angles TEXT[] DEFAULT '{}',
  selected_gap_insights TEXT[] DEFAULT '{}',
  tone_profile_id UUID,
  use_knowledge_base BOOLEAN DEFAULT false,
  context_file_names TEXT[] DEFAULT '{}',
  
  -- CTA settings
  cta_url TEXT,
  generated_ctas JSONB,
  
  -- Color palette
  color_palette TEXT,
  
  -- Article images
  article_images JSONB,
  
  -- Applied rules snapshot
  applied_rules JSONB,
  
  -- Metadata
  word_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_articles ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth in this app)
CREATE POLICY "Allow public read access to saved_articles"
  ON public.saved_articles FOR SELECT USING (true);

CREATE POLICY "Allow public insert to saved_articles"
  ON public.saved_articles FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update to saved_articles"
  ON public.saved_articles FOR UPDATE USING (true);

CREATE POLICY "Allow public delete from saved_articles"
  ON public.saved_articles FOR DELETE USING (true);

-- Auto-update timestamp trigger
CREATE TRIGGER update_saved_articles_updated_at
  BEFORE UPDATE ON public.saved_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
