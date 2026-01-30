-- Create storage bucket for SEO knowledge documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('seo-knowledge', 'seo-knowledge', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for seo-knowledge bucket
CREATE POLICY "Allow public uploads to seo-knowledge"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'seo-knowledge');

CREATE POLICY "Allow public reads from seo-knowledge"
ON storage.objects FOR SELECT
USING (bucket_id = 'seo-knowledge');

CREATE POLICY "Allow public deletes from seo-knowledge"
ON storage.objects FOR DELETE
USING (bucket_id = 'seo-knowledge');