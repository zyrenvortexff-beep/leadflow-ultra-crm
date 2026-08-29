# Análisis Integral de Arquitectura y Funcionamiento: LeadFlow Ultra (CRM WhatsApp Meta Cloud API)

---

## 1. Resumen Ejecutivo y Propósito del Proyecto

**LeadFlow Ultra** es una plataforma **SaaS CRM Multi-Inquilino (Multi-tenant) de Marca Blanca** diseñada para la captación, automatización, gestión y monetización de ventas a través de la **API Oficial de WhatsApp Cloud de Meta (Graph API v20.0)**.

El sistema permite aislar completamente la información de cada empresa/cliente (leads, contactos, configuraciones, automatizaciones, mensajes, notas de voz y multimedia) mediante políticas de seguridad a nivel de fila (**PostgreSQL Row Level Security - RLS**), a la vez que proporciona paneles especializados de **Superadministrador** y **Revendedor/Agente** para escalar el modelo de negocio SaaS sin costos de intermediarios.

---

## 2. Pila Tecnológica (Tech Stack)

### 2.1. Frontend
- **Framework & Core**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Enrutador**: [@tanstack/react-router](https://tanstack.com/router) (Enrutamiento tipado basado en archivos)
- **Gestor de Estado y Consultas**: [@tanstack/react-query](https://tanstack.com/query)
- **Motor de Audio & Grabación de Voz**: [Web Audio API](https://developer.mozilla.org/es/docs/Web/API/Web_Audio_API) + [@breezystack/lamejs](https://github.com/shijinyu/lamejs) (Codificación de audio PCM a MP3 real `audio/mpeg` a 128 kbps compatible al 100% con Meta WhatsApp Cloud API).
- **Estilos y Diseño**: [Tailwind CSS v4](https://tailwindcss.com/) + CSS Variables Oklch
- **Componentes UI**: [Radix UI](https://www.radix-ui.com/) (primitivas accesibles) + [Shadcn UI](https://ui.shadcn.com/)
- **Animaciones e Interacciones**: [Framer Motion](https://www.framer.com/motion/) + `@dnd-kit/core` & `@dnd-kit/sortable` (Drag & Drop en Kanban)
- **Métricas y Gráficos**: [Recharts](https://recharts.org/)
- **Notificaciones**: [Sonner](https://sonner.emilkowal.ski/)
- **Bundler & Build Tool**: [Vite](https://vitejs.dev/) + [Nitro](https://nitro.unjs.io/)

### 2.2. Backend & Motor Serverless (Edge Runtime)
- **Cloudflare Workers (Nitro Engine)**:
  - Microservicios de baja latencia desplegados en el Edge global de Cloudflare.
  - Endpoints dedicados para Webhooks de Meta, despacho de mensajes con soporte de texto/imágenes/audio, campañas masivas con intervalos de pausa controlados (`delay_seconds`), sincronización de perfil comercial y administración de usuarios.
- **Supabase (PostgreSQL 15+)**:
  - **Base de Datos Relacional**: Aislamiento multi-tenant estricto mediante RLS, triggers automáticos y funciones PL/pgSQL.
  - **Supabase Auth**: Autenticación segura por email/contraseña, recuperación y asignación de roles.
  - **Supabase Realtime**: Suscripciones WebSocket para actualización instantánea de chats, leads y estadísticas.
  - **Supabase Storage**: Bucket público `crm-media` para fotos de perfil, imágenes de chat, audios `.mp3` y notas de voz `.ogg`.

---

## 3. Estructura de Directorios del Proyecto

```plaintext
crm-leadflow-meta/
├── .env                                # Variables de entorno locales
├── package.json                        # Dependencias y scripts del proyecto
├── tsconfig.json                       # Configuración de TypeScript
├── vite.config.ts                      # Configuración de Vite con handlers de Nitro para Cloudflare
├── wrangler.jsonc                      # Configuración de despliegue Cloudflare Workers
├── public/                             # Recursos estáticos (favicons, manifest, etc.)
│
├── server/                             # Endpoints de Backend Nativos (Nitro / Cloudflare)
│   └── routes/
│       ├── api/
│       │   ├── webhook/whatsapp.ts     # Recepción de Webhooks, descarga de audios/fotos y autorrespuestas con delay
│       │   ├── whatsapp-handler.ts     # Envío de mensajes de texto, imágenes y notas de voz MP3 a Meta Graph API
│       │   ├── campaigns-dispatch.ts   # Despachador de campañas masivas con respeto de delay_seconds entre contactos
│       │   ├── whatsapp-profile.ts     # Sincronización de foto y perfil comercial en Meta Graph API
│       │   ├── meta-test.ts            # Diagnóstico de salud y calidad de conexión en Meta
│       │   └── admin-users.ts          # Gestión administrativa de usuarios y roles
│       └── functions/                  # Alias de compatibilidad retroactiva
│
├── src/
│   ├── components/                     # Componentes React reutilizables
│   │   ├── layout/
│   │   │   └── AppLayout.tsx           # Sidebar interactivo, navegación global, avatar dinámico y header
│   │   ├── ui/                         # Primitivas de Shadcn UI (button, dialog, tabs, etc.)
│   │   ├── EmailVerificationGate.tsx   # Control de acceso por verificación de email
│   │   └── SuspensionGuard.tsx         # Bloqueo de interfaz si la organización está suspendida
│   │
│   ├── integrations/supabase/          # Conexión y tipos de Supabase
│   │   ├── client.ts                   # Instancia del cliente Supabase Browser
│   │   ├── client.server.ts            # Cliente Supabase para SSR / Edge
│   │   └── types.ts                    # Definiciones TypeScript de la BD
│   │
│   ├── lib/                            # Utilidades y Lógica de Negocio Compartida
│   │   ├── audio-recorder.ts           # Grabador de micrófono y codificador de audio a MP3 real (128 kbps)
│   │   ├── auth-context.tsx            # Proveedor de autenticación, rol y organización activa
│   │   ├── functions.ts                # Helper invokeFunction para llamadas directas al backend
│   │   ├── messages-cache.ts           # Caché local IndexedDB/localStorage para optimizar el chat
│   │   └── use-daily-usage.ts          # Control de consumo diario de mensajes
│   │
│   ├── routes/                         # Vistas / Rutas de TanStack Router
│   │   ├── __root.tsx                  # Envoltorio raíz con QueryClient y Toaster
│   │   ├── _app.tsx                    # Layout protegido para usuarios autenticados
│   │   ├── _app.dashboard.tsx          # Panel de métricas analíticas y consumo diario
│   │   ├── _app.profile.tsx            # Mi Perfil CRM & Perfil Comercial de WhatsApp en Meta
│   │   ├── _app.whatsapp.tsx           # WhatsApp Hub (Diagnóstico, credenciales y webhook)
│   │   ├── _app.leads.tsx              # Tablero Kanban con Drag & Drop y Drawer de Lead
│   │   ├── _app.contacts.tsx           # Directorio de contactos y gestión de etiquetas
│   │   ├── _app.groups.tsx             # Gestor y rotador de enlaces de comunidades WhatsApp
│   │   ├── _app.automations.tsx        # Motor de autorrespuestas con delay y Simulador iPhone
│   │   ├── _app.campaigns.tsx          # Campañas masivas con auto-despacho y pausa configurable entre envíos
│   │   ├── _app.messages.tsx           # Chat bidireccional en vivo con fotos, notas de voz y reproductor de audio
│   │   ├── _app.errors.tsx             # Visor de logs y diagnóstico de errores devueltos por Meta
│   │   ├── _app.superadmin.tsx         # Panel maestro para control de clientes, planes y servidor
│   │   └── _app.agent.tsx              # Panel de revendedor para registrar y gestionar sub-clientes
```

---

## 4. Módulos Funcionales Destacados

### 4.1. Mensajería en Tiempo Real con Notas de Voz y Multimedia
- **Grabador de Micrófono en Vivo**: Graba directamente desde el navegador y codifica a MP3 estándar de 128 kbps (`audio/mpeg`), formato aceptado por los servidores de Meta sin errores de contenedor.
- **Reproductor de Audio Integrado**: Permite escuchar audios entrantes y salientes con controles Play/Pause, seekbar y duración.
- **Descarga Automática de Medios**: El webhook en `/api/webhook/whatsapp` descarga automáticamente fotos y notas de voz entrantes desde Meta Graph API y las almacena en Supabase Storage `crm-media`.

### 4.2. Campañas Masivas con Auto-Despacho y Pausa Configurable
- **Control de Cadencia Anti-Spam (`delay_seconds`)**: Selector de intervalos (3s, 5s, 8s, 15s, 30s) entre cada contacto para proteger el número contra bloqueos.
- **Auto-Despacho en Background**: El frontend y los workers monitorean campañas programadas (`schedule_time <= NOW()`) y ejecutan el envío automáticamente sin requerir clics manuales.

### 4.3. Perfil de WhatsApp Business Sincronizado con Meta
- Actualización de Display Name, About, Descripción Comercial, Sitio Web, Correo Electrónico y Categoría.
- Subida directa de Foto de Perfil Oficial de WhatsApp mediante sesión de subida reanudable (Resumable Upload Session) a Meta Graph API.

---

## 5. Conclusión
LeadFlow Ultra constituye una solución SaaS completa, moderna y robusta, optimizada para operar a escala global con costos mínimos de infraestructura gracias al modelo Serverless en Cloudflare Workers y Supabase.
