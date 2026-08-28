-- Allow superadmin to list all users with org info
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  org_id uuid,
  org_name text,
  plan_type public.plan_type,
  org_status public.org_status,
  role public.app_role,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text,
    p.full_name,
    o.id AS org_id,
    o.name AS org_name,
    o.plan_type,
    o.status AS org_status,
    (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = u.id ORDER BY ur.created_at ASC LIMIT 1) AS role,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.organizations o ON o.id = p.org_id
  ORDER BY u.created_at DESC;
END;
$$;

-- Allow superadmin to suspend/activate a user's organization
CREATE OR REPLACE FUNCTION public.admin_set_org_status(_org_id uuid, _status public.org_status)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.organizations SET status = _status, updated_at = now() WHERE id = _org_id;
END;
$$;

-- Allow superadmin to change a user's role
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT org_id INTO _org FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role, org_id) VALUES (_user_id, _role, _org);
END;
$$;