
-- Contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  tags text[] DEFAULT '{}'::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_org_idx ON public.contacts(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_phone_uq ON public.contacts(org_id, phone);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org access contacts" ON public.contacts;
CREATE POLICY "Org access contacts" ON public.contacts
FOR ALL TO authenticated
USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()))
WITH CHECK (org_id = public.get_user_org(auth.uid()));

-- Agent -> client
CREATE TABLE IF NOT EXISTS public.agent_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_user_id, org_id)
);
CREATE INDEX IF NOT EXISTS agent_clients_agent_idx ON public.agent_clients(agent_user_id);
ALTER TABLE public.agent_clients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_agent_of_org(_agent uuid, _org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.agent_clients WHERE agent_user_id = _agent AND org_id = _org)
$$;

DROP POLICY IF EXISTS "Agent sees own clients" ON public.agent_clients;
CREATE POLICY "Agent sees own clients" ON public.agent_clients
FOR SELECT TO authenticated
USING (agent_user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Agent creates own client links" ON public.agent_clients;
CREATE POLICY "Agent creates own client links" ON public.agent_clients
FOR INSERT TO authenticated
WITH CHECK (agent_user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Agent deletes own client links" ON public.agent_clients;
CREATE POLICY "Agent deletes own client links" ON public.agent_clients
FOR DELETE TO authenticated
USING (agent_user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Agent sees client orgs" ON public.organizations;
CREATE POLICY "Agent sees client orgs" ON public.organizations
FOR SELECT TO authenticated
USING (public.is_agent_of_org(auth.uid(), id));

DROP POLICY IF EXISTS "Agent updates client orgs" ON public.organizations;
CREATE POLICY "Agent updates client orgs" ON public.organizations
FOR UPDATE TO authenticated
USING (public.is_agent_of_org(auth.uid(), id))
WITH CHECK (public.is_agent_of_org(auth.uid(), id));

-- Daily usage
CREATE TABLE IF NOT EXISTS public.daily_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  messages_sent integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, usage_date)
);
CREATE INDEX IF NOT EXISTS daily_usage_org_date_idx ON public.daily_usage(org_id, usage_date DESC);
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org reads own usage" ON public.daily_usage;
CREATE POLICY "Org reads own usage" ON public.daily_usage
FOR SELECT TO authenticated
USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()) OR public.is_agent_of_org(auth.uid(), org_id));

CREATE OR REPLACE FUNCTION public.daily_limit_for_plan(_plan public.plan_type)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _plan::text
    WHEN 'trial' THEN 10
    WHEN 'vip'   THEN 150
    WHEN 'pro'   THEN 200
    WHEN 'elite' THEN 2147483647
    ELSE 10
  END
$$;

CREATE OR REPLACE FUNCTION public.increment_daily_usage(_org_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plan public.plan_type;
  _limit integer;
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _new integer;
BEGIN
  SELECT plan_type INTO _plan FROM public.organizations WHERE id = _org_id;
  IF _plan IS NULL THEN RETURN NULL; END IF;
  _limit := public.daily_limit_for_plan(_plan);

  INSERT INTO public.daily_usage (org_id, usage_date, messages_sent)
  VALUES (_org_id, _today, 1)
  ON CONFLICT (org_id, usage_date)
  DO UPDATE SET messages_sent = public.daily_usage.messages_sent + 1, updated_at = now()
  RETURNING messages_sent INTO _new;

  IF _new > _limit THEN
    UPDATE public.daily_usage SET messages_sent = messages_sent - 1, updated_at = now()
    WHERE org_id = _org_id AND usage_date = _today;
    RETURN NULL;
  END IF;
  RETURN _new;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_usage(_org_id uuid)
RETURNS TABLE(used integer, plan_limit integer, plan public.plan_type)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plan public.plan_type;
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _used integer;
BEGIN
  SELECT plan_type INTO _plan FROM public.organizations WHERE id = _org_id;
  SELECT COALESCE(messages_sent, 0) INTO _used FROM public.daily_usage WHERE org_id = _org_id AND usage_date = _today;
  RETURN QUERY SELECT COALESCE(_used,0), public.daily_limit_for_plan(_plan), _plan;
END;
$$;

-- Updated admin_list_users
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  user_id uuid, email text, full_name text,
  org_id uuid, org_name text,
  plan_type public.plan_type, org_status public.org_status,
  role public.app_role, created_at timestamptz,
  agent_id uuid
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT
    u.id, u.email::text, p.full_name,
    o.id, o.name, o.plan_type, o.status,
    (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = u.id ORDER BY ur.created_at ASC LIMIT 1),
    u.created_at,
    (SELECT ac.agent_user_id FROM public.agent_clients ac WHERE ac.org_id = o.id LIMIT 1)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.organizations o ON o.id = p.org_id
  ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_list_clients()
RETURNS TABLE(
  user_id uuid, email text, full_name text,
  org_id uuid, org_name text,
  plan_type public.plan_type, org_status public.org_status,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'agent') OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, p.full_name,
         o.id, o.name, o.plan_type, o.status, u.created_at
  FROM public.agent_clients ac
  JOIN public.organizations o ON o.id = ac.org_id
  LEFT JOIN public.profiles p ON p.org_id = o.id
  LEFT JOIN auth.users u ON u.id = p.user_id
  WHERE ac.agent_user_id = auth.uid() OR public.is_superadmin(auth.uid())
  ORDER BY u.created_at DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_set_client_plan(_org_id uuid, _plan public.plan_type)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_agent_of_org(auth.uid(), _org_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.organizations SET plan_type = _plan, updated_at = now() WHERE id = _org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_set_client_status(_org_id uuid, _status public.org_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_agent_of_org(auth.uid(), _org_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.organizations SET status = _status, updated_at = now() WHERE id = _org_id;
END;
$$;

-- Daily cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN PERFORM cron.unschedule('daily-usage-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'daily-usage-cleanup',
  '0 0 * * *',
  $$DELETE FROM public.daily_usage WHERE usage_date < (now() AT TIME ZONE 'UTC')::date - INTERVAL '90 days';$$
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_usage;
