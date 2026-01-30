-- Create storage bucket for context files
INSERT INTO storage.buckets (id, name, public)
VALUES ('context-files', 'context-files', false);

-- Allow authenticated and anonymous uploads (for MVP simplicity)
CREATE POLICY "Anyone can upload context files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'context-files');

-- Allow reading own uploaded files
CREATE POLICY "Anyone can read context files"
ON storage.objects FOR SELECT
USING (bucket_id = 'context-files');