CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  event text,
  instance text,
  org_id uuid,
  from_number text,
  text_content text,
  matched_keyword text,
  processing_result text,
  raw_payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_instance ON public.webhook_logs (instance);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin reads webhook logs" ON public.webhook_logs;
CREATE POLICY "Superadmin reads webhook logs"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Superadmin deletes webhook logs" ON public.webhook_logs;
CREATE POLICY "Superadmin deletes webhook logs"
ON public.webhook_logs
FOR DELETE
TO authenticated
USING (public.is_superadmin(auth.uid()));