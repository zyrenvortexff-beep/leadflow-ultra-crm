
-- Rename pre-existing duplicate org names by appending a numeric suffix
-- (keep the oldest as the canonical name).
WITH ranked AS (
  SELECT id, name,
         row_number() OVER (PARTITION BY lower(btrim(name)) ORDER BY created_at ASC) AS rn
  FROM public.organizations
)
UPDATE public.organizations o
SET name = o.name || ' ' || r.rn::text, updated_at = now()
FROM ranked r
WHERE o.id = r.id AND r.rn > 1;

-- Now the unique index can be created safely.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_unique_name_ci
  ON public.organizations (lower(btrim(name)));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  assigned_role public.app_role;
  base_name text;
  candidate text;
  n int := 1;
BEGIN
  IF NEW.email = 'teretovector.pan@gmail.com' THEN
    assigned_role := 'superadmin';
  ELSE
    assigned_role := 'client_admin';
  END IF;

  base_name := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'org_name'), ''), 'Mi Organización');
  candidate := base_name;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE lower(btrim(name)) = lower(btrim(candidate))) LOOP
    n := n + 1;
    candidate := base_name || ' ' || n::text;
  END LOOP;

  INSERT INTO public.organizations (name, plan_type) VALUES (candidate, 'trial') RETURNING id INTO new_org_id;
  INSERT INTO public.profiles (user_id, org_id, full_name)
    VALUES (NEW.id, new_org_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role, org_id) VALUES (NEW.id, assigned_role, new_org_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_user_organization()
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  existing_org uuid;
  new_org_id uuid;
  assigned_role public.app_role;
  base_name text;
  candidate text;
  n int := 1;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;
  SELECT email INTO uemail FROM auth.users WHERE id = uid;
  SELECT org_id INTO existing_org FROM public.profiles WHERE user_id = uid LIMIT 1;
  IF existing_org IS NOT NULL THEN RETURN existing_org; END IF;

  IF uemail = 'teretovector.pan@gmail.com' THEN
    assigned_role := 'superadmin'; base_name := 'Organización Maestro';
  ELSE
    assigned_role := 'client_admin'; base_name := 'Mi Organización';
  END IF;

  candidate := base_name;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE lower(btrim(name)) = lower(btrim(candidate))) LOOP
    n := n + 1;
    candidate := base_name || ' ' || n::text;
  END LOOP;

  INSERT INTO public.organizations (name, plan_type) VALUES (candidate, 'trial') RETURNING id INTO new_org_id;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = uid) THEN
    UPDATE public.profiles SET org_id = new_org_id WHERE user_id = uid;
  ELSE
    INSERT INTO public.profiles (user_id, org_id, full_name) VALUES (uid, new_org_id, COALESCE(uemail, 'Usuario'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = assigned_role) THEN
    INSERT INTO public.user_roles (user_id, role, org_id) VALUES (uid, assigned_role, new_org_id);
  ELSE
    UPDATE public.user_roles SET org_id = new_org_id WHERE user_id = uid AND role = assigned_role;
  END IF;
  RETURN new_org_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.org_name_exists(_name text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.organizations WHERE lower(btrim(name)) = lower(btrim(_name)))
$function$;

GRANT EXECUTE ON FUNCTION public.org_name_exists(text) TO authenticated;

-- Agent dashboard count: returns how many clients the current agent has.
CREATE OR REPLACE FUNCTION public.agent_client_count()
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT count(*)::int FROM public.agent_clients WHERE agent_user_id = auth.uid()), 0)
$function$;

GRANT EXECUTE ON FUNCTION public.agent_client_count() TO authenticated;
