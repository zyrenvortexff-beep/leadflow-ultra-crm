
-- 1) Re-attach handle_new_user trigger on auth.users (was missing)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill existing invited client: link to Jose (agent) and restore metadata-driven names
DO $$
DECLARE
  _client_user uuid := '66092da4-580c-417e-8adf-95f83ac3c5a0';
  _agent_user  uuid := '894c02b7-c3e5-420f-ae17-a61a81cf7b52';
  _client_org  uuid := '4c78846c-8e00-4d29-9a48-c3b889f8737a';
  _meta jsonb;
BEGIN
  SELECT raw_user_meta_data INTO _meta FROM auth.users WHERE id = _client_user;

  UPDATE public.organizations
    SET name = COALESCE(_meta->>'org_name', name), updated_at = now()
    WHERE id = _client_org;

  UPDATE public.profiles
    SET full_name = COALESCE(_meta->>'full_name', full_name)
    WHERE user_id = _client_user;

  INSERT INTO public.agent_clients (agent_user_id, org_id)
  VALUES (_agent_user, _client_org)
  ON CONFLICT DO NOTHING;
END $$;
