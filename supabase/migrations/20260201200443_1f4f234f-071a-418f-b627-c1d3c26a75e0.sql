-- Create public bucket for article images
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-images', 'article-images', true);

-- Allow public read access
CREATE POLICY "Public can view article images"
ON storage.objects FOR SELECT
USING (bucket_id = 'article-images');

-- Allow uploads (anonymous for now, can restrict later)
CREATE POLICY "Anyone can upload article images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'article-images');

-- Allow delete
CREATE POLICY "Anyone can delete article images"
ON storage.objects FOR DELETE
USING (bucket_id = 'article-images');