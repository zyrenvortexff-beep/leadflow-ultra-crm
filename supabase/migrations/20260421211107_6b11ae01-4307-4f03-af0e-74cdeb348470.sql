
-- Function: ensure the current user has an organization, profile, and role
CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  existing_org uuid;
  new_org_id uuid;
  assigned_role public.app_role;
  org_name text;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get email
  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  -- Already has org via profile?
  SELECT org_id INTO existing_org FROM public.profiles WHERE user_id = uid LIMIT 1;
  IF existing_org IS NOT NULL THEN
    RETURN existing_org;
  END IF;

  -- Determine role + org name
  IF uemail = 'teretovector.pan@gmail.com' THEN
    assigned_role := 'superadmin';
    org_name := 'Organización Maestro';
  ELSE
    assigned_role := 'client_admin';
    org_name := 'Mi Organización';
  END IF;

  -- Create organization
  INSERT INTO public.organizations (name, plan_type)
  VALUES (org_name, 'trial')
  RETURNING id INTO new_org_id;

  -- Create or update profile with org_id
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = uid) THEN
    UPDATE public.profiles SET org_id = new_org_id WHERE user_id = uid;
  ELSE
    INSERT INTO public.profiles (user_id, org_id, full_name)
    VALUES (uid, new_org_id, COALESCE(uemail, 'Usuario'));
  END IF;

  -- Ensure role exists
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = assigned_role) THEN
    INSERT INTO public.user_roles (user_id, role, org_id)
    VALUES (uid, assigned_role, new_org_id);
  ELSE
    UPDATE public.user_roles SET org_id = new_org_id WHERE user_id = uid AND role = assigned_role;
  END IF;

  RETURN new_org_id;
END;
$$;

-- Backfill: create org for any existing user without one
DO $$
DECLARE
  r record;
  new_org_id uuid;
  assigned_role public.app_role;
  org_name text;
BEGIN
  FOR r IN
    SELECT u.id AS user_id, u.email
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE p.org_id IS NULL
  LOOP
    IF r.email = 'teretovector.pan@gmail.com' THEN
      assigned_role := 'superadmin';
      org_name := 'Organización Maestro';
    ELSE
      assigned_role := 'client_admin';
      org_name := 'Mi Organización';
    END IF;

    INSERT INTO public.organizations (name, plan_type)
    VALUES (org_name, 'trial')
    RETURNING id INTO new_org_id;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = r.user_id) THEN
      UPDATE public.profiles SET org_id = new_org_id WHERE user_id = r.user_id;
    ELSE
      INSERT INTO public.profiles (user_id, org_id, full_name)
      VALUES (r.user_id, new_org_id, COALESCE(r.email, 'Usuario'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = r.user_id AND role = assigned_role) THEN
      INSERT INTO public.user_roles (user_id, role, org_id)
      VALUES (r.user_id, assigned_role, new_org_id);
    END IF;
  END LOOP;
END $$;
