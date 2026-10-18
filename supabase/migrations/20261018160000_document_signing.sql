-- Document signing tool: owner-only documents, placed fields, one-time recipient tokens.
-- The owner is identified by the verified email in the Supabase Auth JWT.
-- Recipients never hold a Supabase session. They act through the sign-public edge function
-- (service role), authorised by a one-time token whose SHA-256 hash is stored here.

CREATE OR REPLACE FUNCTION public.is_sign_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@rankdough.com'
$$;

CREATE TABLE public.sign_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'void')),
  original_path text NOT NULL,
  original_sha256 text NOT NULL,
  page_count integer NOT NULL CHECK (page_count > 0),
  recipient_name text,
  recipient_email text,
  message text,
  signed_path text,
  signed_sha256 text,
  signer_ip text,
  signer_user_agent text,
  sent_at timestamptz,
  expires_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Field boxes are fractions of the page (0 to 1), measured from the top-left corner of the page as displayed.
CREATE TABLE public.sign_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sign_documents(id) ON DELETE CASCADE,
  party text NOT NULL CHECK (party IN ('owner', 'recipient')),
  kind text NOT NULL CHECK (kind IN ('signature', 'date')),
  page integer NOT NULL CHECK (page > 0),
  x double precision NOT NULL CHECK (x >= 0 AND x <= 1),
  y double precision NOT NULL CHECK (y >= 0 AND y <= 1),
  w double precision NOT NULL CHECK (w > 0 AND w <= 1),
  h double precision NOT NULL CHECK (h > 0 AND h <= 1),
  value text, -- owner signature PNG data URL, set before sending
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sign_fields_document_idx ON public.sign_fields (document_id);

CREATE TABLE public.sign_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sign_documents(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sign_tokens_document_idx ON public.sign_tokens (document_id);

ALTER TABLE public.sign_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sign_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sign_tokens ENABLE ROW LEVEL SECURITY; -- no policies: service role only

CREATE POLICY "Owner manages sign documents" ON public.sign_documents
  FOR ALL TO authenticated USING (public.is_sign_owner()) WITH CHECK (public.is_sign_owner());

CREATE POLICY "Owner manages sign fields" ON public.sign_fields
  FOR ALL TO authenticated USING (public.is_sign_owner()) WITH CHECK (public.is_sign_owner());

CREATE OR REPLACE FUNCTION public.sign_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER sign_documents_touch_updated_at
  BEFORE UPDATE ON public.sign_documents
  FOR EACH ROW EXECUTE FUNCTION public.sign_touch_updated_at();

-- Private bucket. Originals live under originals/, finished copies under signed/.
INSERT INTO storage.buckets (id, name, public)
VALUES ('sign-docs', 'sign-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owner reads sign docs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'sign-docs' AND public.is_sign_owner());

CREATE POLICY "Owner uploads sign docs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sign-docs' AND public.is_sign_owner());

CREATE POLICY "Owner deletes sign docs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'sign-docs' AND public.is_sign_owner());
