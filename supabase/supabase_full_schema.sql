-- ========================================================
-- LEADFLOW ULTRA CRM - FULL DATABASE SCHEMA MIGRATION
-- ========================================================



-- >>> FILE: 20260421200722_bf58c9f4-cebe-4edf-831a-ca6beeab728f.sql <<<

-- Enums
CREATE TYPE public.app_role AS ENUM ('superadmin', 'client_admin', 'agent');
CREATE TYPE public.plan_type AS ENUM ('trial', 'pro', 'elite');
CREATE TYPE public.org_status AS ENUM ('active', 'suspended');
CREATE TYPE public.provider_type AS ENUM ('Evolution_VPS', 'Whapi', 'ZAPI');
CREATE TYPE public.connection_status AS ENUM ('connected', 'disconnected', 'pending');
CREATE TYPE public.lead_status AS ENUM ('nuevo', 'interesado', 'cliente', 'perdido');
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'scheduled', 'completed');

-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo TEXT,
  plan_type plan_type NOT NULL DEFAULT 'trial',
  status org_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Roles (separate, secure)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, org_id)
);

-- WhatsApp Configs
CREATE TABLE public.whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_type provider_type NOT NULL,
  api_url TEXT,
  api_token TEXT,
  instance_name TEXT,
  webhook_secret TEXT,
  status connection_status NOT NULL DEFAULT 'disconnected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  tags TEXT[] DEFAULT '{}',
  status lead_status NOT NULL DEFAULT 'nuevo',
  notes TEXT,
  last_contact TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Automations
CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_keyword TEXT NOT NULL,
  response_text TEXT NOT NULL,
  media_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  delay_seconds INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_body TEXT NOT NULL,
  target_tags TEXT[] DEFAULT '{}',
  schedule_time TIMESTAMPTZ,
  total_leads INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  status campaign_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages Log
CREATE TABLE public.messages_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  direction message_direction NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Global settings (superadmin)
CREATE TABLE public.global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_base_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_org(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT org_id FROM public.profiles WHERE user_id = _user_id LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin') $$;

-- Auto-create profile + org on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
BEGIN
  INSERT INTO public.organizations (name, plan_type)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', 'Mi Organización'), 'trial')
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (user_id, org_id, full_name)
  VALUES (NEW.id, new_org_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, role, org_id)
  VALUES (NEW.id, 'client_admin', new_org_id);

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Organizations
CREATE POLICY "Users see their org" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin manages orgs" ON public.organizations FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Client admin updates own org" ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.get_user_org(auth.uid()) AND public.has_role(auth.uid(), 'client_admin'));

-- Profiles
CREATE POLICY "Users see profiles in org" ON public.profiles FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR user_id = auth.uid() OR public.is_superadmin(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- User roles
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- WhatsApp configs
CREATE POLICY "Org access whatsapp" ON public.whatsapp_configs FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));

-- Leads
CREATE POLICY "Org access leads" ON public.leads FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

-- Automations
CREATE POLICY "Org access automations" ON public.automations FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

-- Campaigns
CREATE POLICY "Org access campaigns" ON public.campaigns FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

-- Messages log
CREATE POLICY "Org access messages" ON public.messages_log FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

-- Global settings
CREATE POLICY "Anyone read global settings" ON public.global_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superadmin writes global settings" ON public.global_settings FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

INSERT INTO public.global_settings (evolution_base_url) VALUES ('https://evolution.tudominio.com');



-- >>> FILE: 20260421202929_57b53c6f-9966-4c18-98c8-a377cb0d307c.sql <<<
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



-- >>> FILE: 20260421211107_6b11ae01-4307-4f03-af0e-74cdeb348470.sql <<<

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



-- >>> FILE: 20260421212832_9212ebb5-ae3b-4537-94fe-dc025d1a9a22.sql <<<

ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS link_regalo text;

ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS automation_id uuid;
ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS recipient text;
ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS keyword_matched text;

-- lead_id and content are NOT NULL in original schema for messages_log -- relax for system logs
ALTER TABLE public.messages_log ALTER COLUMN content DROP NOT NULL;



-- >>> FILE: 20260421221620_ecfb7d17-6522-4226-8a39-28e8b9392acb.sql <<<
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


-- >>> FILE: 20260421221635_7f97e076-97fe-45f7-9619-c0576e7350be.sql <<<
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_log;


-- >>> FILE: 20260421230953_ee947262-1a4d-4ed1-923c-15eeeba7532d.sql <<<
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'vip' BEFORE 'pro';


-- >>> FILE: 20260421231054_0a7d73e3-520b-43c1-8e09-6a1b5c8ea5cd.sql <<<

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



-- >>> FILE: 20260421231113_b70d74fb-e36a-49d2-af6a-03130a9ad571.sql <<<
CREATE OR REPLACE FUNCTION public.daily_limit_for_plan(_plan public.plan_type)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _plan::text
    WHEN 'trial' THEN 10
    WHEN 'vip'   THEN 150
    WHEN 'pro'   THEN 200
    WHEN 'elite' THEN 2147483647
    ELSE 10
  END
$$;


-- >>> FILE: 20260422003502_ebed3c18-701e-4912-b4b3-43a9e6523cd5.sql <<<
-- Add 'sent' to campaign_status enum (if not already)
DO $$ BEGIN
  ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'sent';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'leads',
  ADD COLUMN IF NOT EXISTS contact_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS manual_numbers text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;



-- >>> FILE: 20260422022802_2c88d6c0-8245-496a-ad9f-2751f3b86ad5.sql <<<

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



-- >>> FILE: 20260422025349_631c0d4e-b0a9-4990-960d-3e03759d0f37.sql <<<
-- Enable pg_cron + pg_net for scheduled invocation of campaigns-dispatch
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with same name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('campaigns-dispatch-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Run every minute, calls the campaigns-dispatch edge function
SELECT cron.schedule(
  'campaigns-dispatch-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ajdjxgdvavbfggnqtwyo.supabase.co/functions/v1/campaigns-dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZGp4Z2R2YXZiZmdnbnF0d3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTI5MTcsImV4cCI6MjA5MjM2ODkxN30.d07SX9FZxB7VYyqqayYTlw1nJbldCenytXes4B3EaJg"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);


-- >>> FILE: 20260422062849_426cec57-c065-4fc8-8063-57a862bdd080.sql <<<
-- Enable pg_cron + pg_net for scheduled campaign dispatch
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- >>> FILE: 20260422062914_08422654-f868-4294-919b-149380b8aed0.sql <<<
-- Remove any prior schedule to keep this idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('campaigns-dispatch-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'campaigns-dispatch-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url:='https://flrmhwyhvomufazgouxg.supabase.co/functions/v1/campaigns-dispatch',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZscm1od3lodm9tdWZhemdvdXhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MjYzMjYsImV4cCI6MjA5MjQwMjMyNn0.XjHC2242A1SyDChn2WO9m0OklKgw1ddzfNs_qHM-NYc"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $cron$
);


-- >>> FILE: 20260424001049_4278df49-b090-45f2-a32c-d2b5904daf10.sql <<<

ALTER TABLE public.whatsapp_configs
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS profile_picture text,
  ADD COLUMN IF NOT EXISTS profile_name text;



-- >>> FILE: 20260424011454_cdd68a7c-49e2-4e86-b9b9-48880318a5ac.sql <<<
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_configs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_log;
ALTER TABLE public.whatsapp_configs REPLICA IDENTITY FULL;
ALTER TABLE public.messages_log REPLICA IDENTITY FULL;


-- >>> FILE: 20260424063351_9744b1e8-83a0-4001-9722-61c937f1d0ff.sql <<<
ALTER TABLE public.campaigns REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;


-- >>> FILE: 20260425010206_6c7f396f-c8c2-49db-9035-5118c327b232.sql <<<
UPDATE public.whatsapp_configs SET provider_type = 'Evolution_VPS', updated_at = now() WHERE provider_type IN ('Whapi','ZAPI');


-- >>> FILE: 20260425234332_c51ef30a-cc2f-4c9b-bd44-f0781deb417a.sql <<<
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_log;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.messages_log REPLICA IDENTITY FULL;
ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER TABLE public.leads REPLICA IDENTITY FULL;


-- >>> FILE: 20260426041859_b6d868ed-b947-43ab-8abc-39cb939f85a8.sql <<<
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('campaigns-dispatch-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'campaigns-dispatch-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rgwndetlueztduqctsws.supabase.co/functions/v1/campaigns-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnd25kZXRsdWV6dGR1cWN0c3dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDY0MzEsImV4cCI6MjA5MjcyMjQzMX0.YX9AI-JStRet_M9pM9GMx99AGruty56W9SdFkY4uEAE',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnd25kZXRsdWV6dGR1cWN0c3dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDY0MzEsImV4cCI6MjA5MjcyMjQzMX0.YX9AI-JStRet_M9pM9GMx99AGruty56W9SdFkY4uEAE'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);


-- >>> FILE: 20260426041947_2f05795e-e07e-4561-bdde-ac0b1a27028f.sql <<<
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


-- >>> FILE: 20260426042130_1f72bc04-1017-49aa-8a47-4cfe31368b5f.sql <<<
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY org_id ORDER BY updated_at DESC, created_at DESC, id DESC) AS rn
  FROM public.whatsapp_configs
)
DELETE FROM public.whatsapp_configs wc
USING ranked r
WHERE wc.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_configs_one_per_org
ON public.whatsapp_configs (org_id);


-- >>> FILE: 20260426050424_8ceb54ff-92c5-411d-9404-c766adb4b919.sql <<<
CREATE OR REPLACE FUNCTION public.daily_limit_for_plan(_plan plan_type)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _plan::text
    WHEN 'trial' THEN 50
    WHEN 'vip'   THEN 500
    WHEN 'pro'   THEN 1000
    WHEN 'elite' THEN 2147483647
    ELSE 50
  END
$function$;


-- >>> FILE: 20260426053145_535b2672-d8dd-4b48-bb48-f610e4b08967.sql <<<
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
  END IF;
END $$;

ALTER TABLE public.campaigns REPLICA IDENTITY FULL;


-- >>> FILE: 20260426061622_7edd130d-5036-4460-848f-86cbb7c13406.sql <<<
ALTER TABLE public.automations
ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.automations a
SET user_id = p.user_id
FROM public.profiles p
WHERE a.org_id = p.org_id
  AND a.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_automations_user_active
ON public.automations (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_automations_org_active
ON public.automations (org_id, is_active);

DROP POLICY IF EXISTS "Org access automations" ON public.automations;

CREATE POLICY "Org access automations"
ON public.automations
FOR ALL
TO authenticated
USING ((org_id = public.get_user_org(auth.uid())) OR public.is_superadmin(auth.uid()))
WITH CHECK ((org_id = public.get_user_org(auth.uid())) AND (user_id IS NULL OR user_id = auth.uid()));


-- >>> FILE: 20260426061906_ff162ef8-e121-413e-ac11-05dcf7d62f31.sql <<<
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_configs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_configs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'automations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;
  END IF;
END $$;


-- >>> FILE: 20260427005523_e091e65c-48e0-4230-b7eb-5fa5a51e3df1.sql <<<
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


-- >>> FILE: 20260427011952_b02efeab-b725-429b-b3db-07d1124971cb.sql <<<
ALTER TABLE public.messages_log REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_log;
  END IF;
END $$;


-- >>> FILE: 20260428015608_664d5b02-e863-49ac-80d9-17103c7b0ee2.sql <<<
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS tag_to_apply text;


-- >>> FILE: 20260429015105_7f514ca0-6fb8-41a6-a665-e37eba885592.sql <<<
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


-- >>> FILE: 20260429015339_962f6499-5055-423c-b16f-c972dea8f31d.sql <<<
REVOKE EXECUTE ON FUNCTION public.sync_whatsapp_instance_from_config() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_whatsapp_instance_from_config() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_whatsapp_instance_from_config() FROM authenticated;


-- >>> FILE: 20260429021513_26b357fa-0089-41c4-a594-310f0d487169.sql <<<
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


-- >>> FILE: 20260506004812_5482b64e-11f7-4a1f-9a0c-a0c7b0ef9e66.sql <<<

CREATE TABLE IF NOT EXISTS public.whatsapp_meta_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE,
  phone_number_id text,
  waba_id text,
  access_token text,
  verify_token text NOT NULL DEFAULT 'LeadFlowoficial2026',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_meta_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org reads own meta config"
  ON public.whatsapp_meta_config FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Org inserts own meta config"
  ON public.whatsapp_meta_config FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Org updates own meta config"
  ON public.whatsapp_meta_config FOR UPDATE
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Org deletes own meta config"
  ON public.whatsapp_meta_config FOR DELETE
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));



-- >>> FILE: 20260506011610_462ddb11-8fe7-4d59-b9dc-d98acb1d99ac.sql <<<
ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS provider_message_id text;
CREATE INDEX IF NOT EXISTS idx_messages_log_provider_message_id ON public.messages_log(provider_message_id);


-- >>> FILE: 20260506030637_e52c701a-26e6-474d-a690-cca5a02f8859.sql <<<
CREATE TABLE IF NOT EXISTS public.meta_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  recipient text,
  error_code text,
  error_title text,
  error_detail text,
  message_content text,
  provider_message_id text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_errors_org_created
  ON public.meta_errors(org_id, created_at DESC);

ALTER TABLE public.meta_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org reads own meta errors"
  ON public.meta_errors FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Org deletes own meta errors"
  ON public.meta_errors FOR DELETE
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_superadmin(auth.uid()));



-- >>> FILE: 20260617005325_26f32668-3e16-4031-be6d-e668d8b41a48.sql <<<
-- Enable realtime broadcasting on tables used by the CRM live views
ALTER TABLE public.messages_log REPLICA IDENTITY FULL;
ALTER TABLE public.campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.automations REPLICA IDENTITY FULL;
ALTER TABLE public.leads REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;


-- >>> FILE: 20260618153843_69567e25-7603-48da-83f9-ad5c94316928.sql <<<
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove old job if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-messages-log');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule daily purge of messages older than 7 days
SELECT cron.schedule(
  'purge-old-messages-log',
  '15 3 * * *', -- daily at 03:15 UTC
  $$DELETE FROM public.messages_log WHERE timestamp < (now() - INTERVAL '7 days');$$
);


-- >>> FILE: 20260618185438_d3c623cf-5d73-4844-95a1-57d71d0b0add.sql <<<
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_clients TO authenticated; GRANT ALL ON public.agent_clients TO service_role;

-- Backfill: link existing invited orgs to the agent that invited them where possible.
-- For now, since there is no tracking column, we cannot auto-assign; admins can do it manually.


-- >>> FILE: 20260620184515_de8595fc-6a27-416b-a3eb-b559c43b813b.sql <<<

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



-- >>> FILE: 20260620205807_ddc4cff1-785e-420e-88f2-0a4e287649db.sql <<<

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

