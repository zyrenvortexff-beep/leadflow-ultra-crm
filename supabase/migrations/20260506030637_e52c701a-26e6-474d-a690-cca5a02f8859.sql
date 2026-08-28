CREATE TABLE IF NOT EXISTS public.meta_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  recipient text,
  error_code text,
  error_title text,
  error_detail text,
  message_content text,
  provider_message_id text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_errors_org_created
  ON public.meta_errors(org_id, created_at DESC);

ALTER TABLE public.meta_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org reads own meta errors"
  ON public.meta_errors FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Org deletes own meta errors"
  ON public.meta_errors FOR DELETE
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));
