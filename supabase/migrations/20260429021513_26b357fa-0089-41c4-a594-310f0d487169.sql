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

INSERT INTO public.whatsapp_instances (instance_name, org_id, user_id, phone_number, status, created_at, updated_at)
SELECT DISTINCT ON (wc.instance_name)
  wc.instance_name,
  wc.org_id,
  p.user_id,
  wc.phone_number,
  wc.status,
  wc.created_at,
  now()
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

REVOKE EXECUTE ON FUNCTION public.sync_whatsapp_instance_from_config() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_whatsapp_instance_from_config() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_whatsapp_instance_from_config() FROM authenticated;