# Crm WhatsApp API META

CONTEXTO DEL SISTEMA: Actúa como un Ingeniero Full-Stack Senior y Diseñador de Producto. Crea un SaaS CRM de marca blanca llamado "LeadFlow Ultra" diseñado para monetizar y automatizar ventas por WhatsApp. El sistema debe ser multi-inquilino (Multi-tenant), permitiendo que múltiples clientes tengan sus propias cuentas aisladas bajo mi control como Superadmin.

1. ARQUITECTURA DE BASE DE DATOS (SUPABASE SQL): Configura las tablas con Relational Row Level Security (RLS) para que los datos de una organización sean invisibles para otra:

organizations: (id, name, logo, plan_type [trial, pro, elite], status).

profiles: (id, user_id, org_id, role [superadmin, client_admin, agent], full_name, avatar).

whatsapp_configs: (id, org_id, provider_type [Evolution_VPS, Whapi, ZAPI], api_url, api_token, instance_name, webhook_secret, status).

leads: (id, org_id, name, phone, email, tags, status [nuevo, interesado, cliente, perdido], last_contact).

automations: (id, org_id, trigger_keyword, response_text, media_url, is_active, delay_seconds).

campaigns: (id, org_id, name, message_body, schedule_time, total_leads, sent_count, status [draft, scheduled, completed]).

messages_log: (id, org_id, lead_id, direction [inbound, outbound], content, timestamp).

2. DISEÑO VISUAL (SaaS PREMIUM UI/UX):

Estética: Dark Mode profundo (#050505). Usa Glassmorphism con fondos translúcidos y desenfoque (backdrop-blur).

Colores: Acentos en Azul Eléctrico (#007AFF) y Violeta Neón (#8B5CF6).

Componentes: Bordes redondeados (16px), sombras suaves, tipografía "Inter" para lectura clara.

Navegación: Sidebar lateral minimalista con iconos de Lucide. Botón de "← Volver al Dashboard" persistente en todas las vistas internas.

3. MÓDULOS PRINCIPALES (PANTALLAS):

A. DASHBOARD ANALÍTICO: Tarjetas con métricas en tiempo real: Leads totales, Conversiones de hoy, Mensajes automáticos enviados y Estado de conexión de WhatsApp. Gráfica lineal de crecimiento de leads semanal.

B. CONEXIÓN TRIPLE (WHATSAPP HUB): Una interfaz para vincular WhatsApp con 3 opciones claras:

Conexión Directa (Mi VPS): Mostrar un iframe o componente que conecte a mi servidor Evolution API para generar el QR.

API Externa: Campos para que el cliente pegue su API Key de Whapi o Z-API.

Modo Manual: Instrucciones para Webhook genérico.

C. AUTOMATIZACIÓN Y PREVISUALIZACIÓN: Editor de respuestas automáticas. A la izquierda, el formulario para la "Palabra Clave" y "Mensaje". A la derecha, un simulador de iPhone 15 Pro Max que muestra en tiempo real cómo se verá el mensaje (incluyendo imágenes o archivos).

D. GESTIÓN DE LEADS (KANBAN): Un tablero visual donde el usuario pueda arrastrar leads de "Nuevo" a "Vendido". Al hacer clic en un lead, abrir un cajón lateral (Drawer) con el historial de mensajes y notas.

E. CENTRO DE CAMPAÑAS (BROADCAST): Interfaz para crear envíos masivos. Selección de etiquetas (tags), redactor de mensajes con variables como {nombre_cliente} y botón de "Programar Envío".

4. LÓGICA DE SUPERADMIN (MI PANEL): Crea una sección oculta (solo para rol superadmin) donde yo pueda:

Ver la lista de todas las organizaciones registradas.

Activar o suspender cuentas de clientes.

Configurar la base_url global de mi servidor Evolution API para todos los clientes.

5. REQUERIMIENTOS DE CÓDIGO:

Usa React con Tailwind CSS.

Implementa Shadcn/UI para los componentes de interfaz.

Asegura que todas las funciones de "Guardar" tengan notificaciones (Toasts) de éxito o error.

Toda la interfaz debe estar en Español.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://crm-leadflow-meta.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/279fe9e8-bac9-4753-bde4-0a1ff706fa0e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
