
-- 1) Realtime: asegurar REPLICA IDENTITY FULL y agregar a publicación
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.messages_log REPLICA IDENTITY FULL;
ALTER TABLE public.daily_usage REPLICA IDENTITY FULL;
ALTER TABLE public.organizations REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.leads; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_log; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_usage; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 2) Función para eliminar usuario en cascada (solo superadmin)
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;

  SELECT org_id INTO _org FROM public.profiles WHERE user_id = _user_id LIMIT 1;

  -- Borrar datos org-scoped solo si esa org no tiene otros miembros
  IF _org IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE org_id = _org AND user_id <> _user_id
  ) THEN
    DELETE FROM public.messages_log     WHERE org_id = _org;
    DELETE FROM public.campaigns        WHERE org_id = _org;
    DELETE FROM public.contacts         WHERE org_id = _org;
    DELETE FROM public.leads            WHERE org_id = _org;
    DELETE FROM public.automations      WHERE org_id = _org;
    DELETE FROM public.whatsapp_configs WHERE org_id = _org;
    DELETE FROM public.daily_usage      WHERE org_id = _org;
    DELETE FROM public.agent_clients    WHERE org_id = _org;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles   WHERE user_id = _user_id;

  IF _org IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE org_id = _org
  ) THEN
    DELETE FROM public.organizations WHERE id = _org;
  END IF;

  -- Borrar de auth.users
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;
