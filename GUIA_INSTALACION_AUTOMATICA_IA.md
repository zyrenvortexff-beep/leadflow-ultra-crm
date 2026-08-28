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
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL,
    etiquetas TEXT[] DEFAULT '{}',
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. MENSAJES DE CHAT
CREATE TABLE IF NOT EXISTS public.messages_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    contacto_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    sender TEXT NOT NULL, -- 'client' o 'agent'
    contenido TEXT,
    media_url TEXT,
    media_type TEXT,
    status TEXT DEFAULT 'delivered',
    meta_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. AUTOMATIZACIONES (BOT)
CREATE TABLE IF NOT EXISTS public.automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    keyword TEXT NOT NULL,
    match_type TEXT NOT NULL DEFAULT 'exact', -- 'exact' o 'contains'
    response_text TEXT NOT NULL,
    media_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. CAMPAÑAS MASIVAS
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    message_text TEXT NOT NULL,
    media_url TEXT,
    target_tags TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'running', 'completed', 'failed'
    total_recipients INT NOT NULL DEFAULT 0,
    sent_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. GRUPOS DE WHATSAPP
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    invite_link TEXT NOT NULL,
    max_members INT DEFAULT 1024,
    current_members INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. LOGS DE WEBHOOK & ERRORES DE META
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.meta_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    error_code TEXT,
    error_subcode TEXT,
    error_message TEXT,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. CONSUMO DIARIO
CREATE TABLE IF NOT EXISTS public.daily_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    messages_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, date)
);

-- 14. BUCKET DE STORAGE PÚBLICO
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-media', 'crm-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 15. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_meta_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- 16. POLÍTICAS RLS BÁSICAS (Permitir lectura y escritura autenticada)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Auth Full Access" ON public.profiles;
    CREATE POLICY "Auth Full Access" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
    
    DROP POLICY IF EXISTS "Auth Full Access" ON public.organizations;
    CREATE POLICY "Auth Full Access" ON public.organizations FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Auth Full Access" ON public.leads;
    CREATE POLICY "Auth Full Access" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Auth Full Access" ON public.contacts;
    CREATE POLICY "Auth Full Access" ON public.contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Auth Full Access" ON public.messages_log;
    CREATE POLICY "Auth Full Access" ON public.messages_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Auth Full Access" ON public.automations;
    CREATE POLICY "Auth Full Access" ON public.automations FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Auth Full Access" ON public.campaigns;
    CREATE POLICY "Auth Full Access" ON public.campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Auth Full Access" ON public.whatsapp_meta_config;
    CREATE POLICY "Auth Full Access" ON public.whatsapp_meta_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Auth Full Access" ON public.whatsapp_groups;
    CREATE POLICY "Auth Full Access" ON public.whatsapp_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $$;
```

---

## ⚙️ PASO 3: Configurar Variables de Entorno (`.env`)

Crea un archivo `.env` en la raíz del proyecto con las claves del usuario:

```env
VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
VITE_SUPABASE_ANON_KEY="tu-anon-key"
SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key"
```

---

## 🚀 PASO 4: Compilar y Desplegar a Cloudflare Workers

Ejecuta en la terminal del proyecto:

```bash
# 1. Instalar dependencias
npm install

# 2. Compilar la aplicación con Nitro
npm run build

# 3. Desplegar en Cloudflare Workers
$env:CLOUDFLARE_API_TOKEN="token_de_cloudflare_del_usuario"
$env:CLOUDFLARE_ACCOUNT_ID="account_id_de_cloudflare_del_usuario"
npx wrangler deploy
```

> Al finalizar, Cloudflare entregará la URL pública (ejemplo: `https://leadflow-crm.tunombre.workers.dev`).

---

## 📱 PASO 5: Vincular Webhook en Meta Developers

1. Entra a [developers.facebook.com](https://developers.facebook.com) > Tu Aplicación > **WhatsApp** > **Configuración**.
2. En la sección **Webhooks**:
   * **URL de devolución de llamada:** `https://tu-dominio-cloudflare.workers.dev/api/webhook/whatsapp`
   * **Identificador de verificación (Verify Token):** `LeadFlowoficial2026`
   * Haz clic en **"Verificar y guardar"**.
3. En **Campos de webhook**, suscríbete al evento **`messages`**.

---

## 👑 PASO 6: Asignar Superadministrador al Usuario

Una vez que el usuario se registre en el sistema con su correo, ejecuta el siguiente SQL en Supabase para otorgarle el rol de Superadmin:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'superadmin' FROM auth.users WHERE email = 'correo_del_usuario@gmail.com'
ON CONFLICT DO NOTHING;
```

---

¡Listo! El CRM quedará 100% operativo, con conexión oficial a Meta, mensajería en tiempo real, guardado automático de fotos y sin depender de ningún intermediario de pago.
