
CREATE TABLE public.product_description_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name text,
  word_count text NOT NULL DEFAULT '200',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.product_description_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.product_description_batches(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  url text DEFAULT '',
  collection text DEFAULT '',
  title text DEFAULT '',
  product_info text DEFAULT '',
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.product_description_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_description_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read product_description_batches" ON public.product_description_batches FOR SELECT USING (true);
CREATE POLICY "Allow public insert product_description_batches" ON public.product_description_batches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update product_description_batches" ON public.product_description_batches FOR UPDATE USING (true);
CREATE POLICY "Allow public delete product_description_batches" ON public.product_description_batches FOR DELETE USING (true);

CREATE POLICY "Allow public read product_description_rows" ON public.product_description_rows FOR SELECT USING (true);
CREATE POLICY "Allow public insert product_description_rows" ON public.product_description_rows FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update product_description_rows" ON public.product_description_rows FOR UPDATE USING (true);
CREATE POLICY "Allow public delete product_description_rows" ON public.product_description_rows FOR DELETE USING (true);
