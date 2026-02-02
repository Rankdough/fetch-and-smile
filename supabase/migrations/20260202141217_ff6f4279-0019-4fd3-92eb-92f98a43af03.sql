-- Create table for image folders
CREATE TABLE public.image_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table to track which images belong to which folders
-- Using storage file path as the key since images are in Supabase storage
CREATE TABLE public.image_folder_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID NOT NULL REFERENCES public.image_folders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(folder_id, file_path)
);

-- Create index for faster lookups
CREATE INDEX idx_image_folder_assignments_folder ON public.image_folder_assignments(folder_id);
CREATE INDEX idx_image_folder_assignments_file ON public.image_folder_assignments(file_path);

-- Enable RLS but allow public access (no auth in this app)
ALTER TABLE public.image_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_folder_assignments ENABLE ROW LEVEL SECURITY;

-- Public access policies
CREATE POLICY "Allow public read access to folders" ON public.image_folders FOR SELECT USING (true);
CREATE POLICY "Allow public insert to folders" ON public.image_folders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to folders" ON public.image_folders FOR UPDATE USING (true);
CREATE POLICY "Allow public delete from folders" ON public.image_folders FOR DELETE USING (true);

CREATE POLICY "Allow public read access to assignments" ON public.image_folder_assignments FOR SELECT USING (true);
CREATE POLICY "Allow public insert to assignments" ON public.image_folder_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete from assignments" ON public.image_folder_assignments FOR DELETE USING (true);