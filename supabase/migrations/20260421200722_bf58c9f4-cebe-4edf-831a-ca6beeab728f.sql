
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
