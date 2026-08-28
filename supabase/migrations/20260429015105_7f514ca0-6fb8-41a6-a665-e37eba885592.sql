CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text NOT NULL UNIQUE,
  user_id uuid,
  org_id uuid NOT NULL,
  phone_number text,
  status connection_status NOT NULL DEFAULT 'disconnected',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_instance_name
ON public.whatsapp_instances (instance_name);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_org_id
ON public.whatsapp_instances (org_id);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org reads own whatsapp instances" ON public.whatsapp_instances;
CREATE POLICY "Org reads own whatsapp instances"
ON public.whatsapp_instances
FOR SELECT
TO authenticated
USING ((org_id = public.get_user_org(auth.uid())) OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Superadmin manages whatsapp instances" ON public.whatsapp_instances;
CREATE POLICY "Superadmin manages whatsapp instances"
ON public.whatsapp_instances
FOR ALL
TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

INSERT INTO public.whatsapp_instances (instance_name, org_id, user_id, phone_number, status, created_at, updated_at)
SELECT DISTINCT ON (wc.instance_name)
  wc.instance_name,
  wc.org_id,
  p.user_id,
  wc.phone_number,
  wc.status,
  wc.created_at,
  wc.updated_at
FROM public.whatsapp_configs wc
LEFT JOIN public.profiles p ON p.org_id = wc.org_id
WHERE wc.instance_name IS NOT NULL AND wc.instance_name <> ''
ORDER BY wc.instance_name, wc.updated_at DESC
ON CONFLICT (instance_name) DO UPDATE SET
  org_id = EXCLUDED.org_id,
  user_id = COALESCE(EXCLUDED.user_id, public.whatsapp_instances.user_id),
  phone_number = EXCLUDED.phone_number,
  status = EXCLUDED.status,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.sync_whatsapp_instance_from_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  owner_user_id uuid;
BEGIN
  IF NEW.instance_name IS NULL OR NEW.instance_name = '' THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO owner_user_id
  FROM public.profiles p
  WHERE p.org_id = NEW.org_id
  ORDER BY p.created_at ASC
  LIMIT 1;

  INSERT INTO public.whatsapp_instances (instance_name, org_id, user_id, phone_number, status, updated_at)
  VALUES (NEW.instance_name, NEW.org_id, owner_user_id, NEW.phone_number, NEW.status, now())
  ON CONFLICT (instance_name) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    user_id = COALESCE(EXCLUDED.user_id, public.whatsapp_instances.user_id),
    phone_number = EXCLUDED.phone_number,
    status = EXCLUDED.status,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_whatsapp_instance_from_config_trigger ON public.whatsapp_configs;
CREATE TRIGGER sync_whatsapp_instance_from_config_trigger
AFTER INSERT OR UPDATE OF instance_name, org_id, phone_number, status
ON public.whatsapp_configs
FOR EACH ROW
EXECUTE FUNCTION public.sync_whatsapp_instance_from_config();