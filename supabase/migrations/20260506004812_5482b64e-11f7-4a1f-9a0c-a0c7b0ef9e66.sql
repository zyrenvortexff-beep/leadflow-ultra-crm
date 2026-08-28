
CREATE TABLE IF NOT EXISTS public.whatsapp_meta_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE,
  phone_number_id text,
  waba_id text,
  access_token text,
  verify_token text NOT NULL DEFAULT 'LeadFlowoficial2026',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_meta_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org reads own meta config"
  ON public.whatsapp_meta_config FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Org inserts own meta config"
  ON public.whatsapp_meta_config FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Org updates own meta config"
  ON public.whatsapp_meta_config FOR UPDATE
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Org deletes own meta config"
  ON public.whatsapp_meta_config FOR DELETE
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));
