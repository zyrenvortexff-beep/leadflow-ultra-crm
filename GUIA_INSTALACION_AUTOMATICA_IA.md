# 🤖 GUÍA DE INSTALACIÓN Y DESPLIEGUE AUTOMATIZADO PARA ASISTENTES IA & DESARROLLADORES

> **Nota para Agentes de IA (Claude, Cursor, Antigravity, OpenAI GPT, Windsurf, etc.):**  
> Sigue esta guía paso a paso para aprovisionar y desplegar una nueva instancia de **LeadFlow Ultra CRM** desde cero para el usuario, sin exponer credenciales previas.

---

## 📋 Resumen del Proceso de Instalación

El proceso consta de **5 pasos sencillos**:
1. **Recopilación de Credenciales:** Solicitar las claves de Supabase, Cloudflare y Meta al usuario.
2. **Migración de Base de Datos:** Crear las 17 tablas, triggers y bucket en Supabase.
3. **Variables de Entorno:** Configurar el archivo `.env`.
4. **Compilación y Despliegue:** Compilar con Nitro y desplegar a Cloudflare Workers.
5. **Configuración del Webhook en Meta:** Vincular la URL de Cloudflare con Meta WhatsApp Cloud API.

---

## 🛠️ PASO 1: Solicitar Credenciales al Usuario

Pídele al usuario que te proporcione los siguientes datos de sus cuentas:

```plaintext
1. SUPABASE_URL: (Ej: https://xxxx.supabase.co)
2. SUPABASE_ANON_KEY: (Anon / Public Key)
3. SUPABASE_SERVICE_ROLE_KEY: (Service Role Secret Key)
4. SUPABASE_DB_URL: (URI de conexión PostgreSQL: postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres)
5. CLOUDFLARE_ACCOUNT_ID: (ID de cuenta de Cloudflare)
6. CLOUDFLARE_API_TOKEN: (Token de Cloudflare con permisos de Workers)
7. SUPERADMIN_EMAIL: (Correo con el que el usuario iniciará sesión y será Superadministrador)
```

---

## 🗄️ PASO 2: Migración de Base de Datos (Supabase PostgreSQL)

Ejecuta el siguiente script SQL en el **SQL Editor de Supabase** o mediante un cliente PostgreSQL de Node (`pg`):

```sql
-- 1. EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLA DE ORGANIZACIONES (MULTI-TENANT)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan_type TEXT NOT NULL DEFAULT 'trial',
    is_suspended BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PERFILES DE USUARIO
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    full_name TEXT,
    avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ROLES DE USUARIO
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, role, org_id)
);

-- 5. CONFIGURACIÓN DE META WHATSAPP
CREATE TABLE IF NOT EXISTS public.whatsapp_meta_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    phone_number_id TEXT,
    waba_id TEXT,
    access_token TEXT,
    verify_token TEXT DEFAULT 'LeadFlowoficial2026',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. LEADS (PIPELINE KANBAN)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    etiquetas TEXT[] DEFAULT '{}',
    notas TEXT,
    avatar TEXT,
    source TEXT DEFAULT 'whatsapp',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. CONTACTOS
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. AUTOMATIZACIONES (BOTS Y AUTORRESPUESTAS CON RETARDO)
CREATE TABLE IF NOT EXISTS public.automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL DEFAULT 'keyword',
    keyword TEXT,
    condition_match_type TEXT DEFAULT 'contains',
    response_type TEXT NOT NULL DEFAULT 'text',
    response_text TEXT,
    response_media_url TEXT,
    response_interactive JSONB,
    funnel_stage TEXT,
    tags_to_add TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    delay_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. HISTORIAL DE MENSAJES Y NOTAS DE VOZ
CREATE TABLE IF NOT EXISTS public.messages_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    recipient TEXT NOT NULL,
    content TEXT,
    media_url TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    error_message TEXT,
    keyword_matched TEXT,
    automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. CAMPAÑAS MASIVAS (CON PROGRAMACIÓN Y RETARDO ANTI-SPAM)
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template_name TEXT,
    target_tags TEXT[],
    target_status TEXT,
    custom_message TEXT,
    media_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    schedule_time TIMESTAMPTZ,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    total_recipients INTEGER DEFAULT 0,
    delay_seconds INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. REGISTRO DE ERRORES DE META
CREATE TABLE IF NOT EXISTS public.meta_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    recipient TEXT,
    error_code TEXT,
    error_title TEXT,
    error_detail TEXT,
    message_content TEXT,
    provider_message_id TEXT,
    raw JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. GESTOR DE COMUNIDADES Y ENLACES ROTATIVOS DE WHATSAPP
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    group_link TEXT NOT NULL,
    current_members INTEGER NOT NULL DEFAULT 0,
    max_capacity INTEGER NOT NULL DEFAULT 1024,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. CONSUMO Y LÍMITES DIARIOS POR ORGANIZACIÓN
CREATE TABLE IF NOT EXISTS public.daily_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    messages_sent INTEGER NOT NULL DEFAULT 0,
    messages_received INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, usage_date)
);

-- 14. LOGS DE WEBHOOK PARA AUDITORÍA
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    event_type TEXT,
    payload JSONB,
    status_code INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. CREAR BUCKET DE ALMACENAMIENTO MULTIMEDIA (FOTOS, AUDIOS Y NOTAS DE VOZ)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('crm-media', 'crm-media', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de Storage
CREATE POLICY "Public Read crm-media" ON storage.objects FOR SELECT USING (bucket_id = 'crm-media');
CREATE POLICY "Public Insert crm-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'crm-media');
CREATE POLICY "Public Update crm-media" ON storage.objects FOR UPDATE USING (bucket_id = 'crm-media');
CREATE POLICY "Public Delete crm-media" ON storage.objects FOR DELETE USING (bucket_id = 'crm-media');

-- 16. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_meta_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- 17. POLÍTICAS DE ACCESO BASE
CREATE POLICY "Public Access Organizations" ON public.organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access User Roles" ON public.user_roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Meta Config" ON public.whatsapp_meta_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Contacts" ON public.contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Automations" ON public.automations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Messages Log" ON public.messages_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Campaigns" ON public.campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Meta Errors" ON public.meta_errors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Groups" ON public.whatsapp_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Daily Usage" ON public.daily_usage FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Webhook Logs" ON public.webhook_logs FOR ALL USING (true) WITH CHECK (true);
```

---

## ⚙️ PASO 3: Configurar Variables de Entorno (`.env`)

Crea o actualiza el archivo `.env` en la raíz del proyecto con las credenciales del usuario:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui
CLOUDFLARE_ACCOUNT_ID=tu-account-id-cloudflare
CLOUDFLARE_API_TOKEN=tu-api-token-cloudflare
```

---

## 🚀 PASO 4: Compilar y Desplegar a Cloudflare Workers

Ejecuta los siguientes comandos desde la terminal:

```bash
# 1. Instalar dependencias
npm install

# 2. Compilar la aplicación con Nitro
npm run build

# 3. Desplegar a Cloudflare Workers
npx wrangler deploy
```

La terminal devolverá la URL de despliegue en vivo:  
`https://leadflow-ultra-crm.tu-subdominio.workers.dev`

---

## 🔗 PASO 5: Vincular el Webhook en Meta for Developers

1. Ingresa a [Meta for Developers](https://developers.facebook.com/) -> Tu Aplicación -> **WhatsApp** -> **Configuración**.
2. En la sección **Webhook**:
   - **URL de devolución de llamada:** `https://leadflow-ultra-crm.tu-subdominio.workers.dev/api/webhook/whatsapp`
   - **Token de verificación:** `LeadFlowoficial2026` (o el que configuraste).
3. Haz clic en **Verificar y Guardar**.
4. En **Campos del Webhook**, suscríbete a `messages` y `message_status`.

---

## 👑 PASO 6: Crear el Primer Usuario Superadministrador

Ejecuta un script o registra al usuario en `https://tu-url.workers.dev/signup`.  
Luego, asígnale el rol de superadministrador ejecutando:

```sql
INSERT INTO public.user_roles (user_id, role, org_id)
SELECT id, 'superadmin', (SELECT id FROM public.organizations LIMIT 1)
FROM auth.users WHERE email = 'tu_correo_superadmin@ejemplo.com'
ON CONFLICT (user_id, role, org_id) DO NOTHING;
```

---

### 🎉 ¡Instalación Completada!
La plataforma estará 100% operativa con mensajería de texto, fotos, notas de voz MP3, automatizaciones con retardo, campañas masivas y control multi-inquilino.
