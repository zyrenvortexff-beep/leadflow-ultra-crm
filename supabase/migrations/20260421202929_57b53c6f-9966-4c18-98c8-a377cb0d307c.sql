-- 1) Update handle_new_user to assign superadmin to specific email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  assigned_role public.app_role;
BEGIN
  -- Determine role based on email
  IF NEW.email = 'teretovector.pan@gmail.com' THEN
    assigned_role := 'superadmin';
  ELSE
    assigned_role := 'client_admin';
  END IF;

  INSERT INTO public.organizations (name, plan_type)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', 'Mi Organización'), 'trial')
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (user_id, org_id, full_name)
  VALUES (NEW.id, new_org_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, role, org_id)
  VALUES (NEW.id, assigned_role, new_org_id);

  RETURN NEW;
END;
$function$;

-- 2) Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) Fix existing user role
UPDATE public.user_roles
SET role = 'superadmin'
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'teretovector.pan@gmail.com'
)
AND role = 'client_admin';
