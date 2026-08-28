import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La página que buscas no existe o fue movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LeadFlow Ultra — CRM de WhatsApp" },
      { name: "description", content: "Automatiza tu WhatsApp con LeadFlow Ultra. CRM premium con respuestas por palabra clave, campañas y gestión de agentes. Escala tus ventas hoy. ¡Únete ya!" },
      { property: "og:title", content: "LeadFlow Ultra — CRM de WhatsApp" },
      { property: "og:description", content: "Automatiza tu WhatsApp con LeadFlow Ultra. CRM premium con respuestas por palabra clave, campañas y gestión de agentes. Escala tus ventas hoy. ¡Únete ya!" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "LeadFlow Ultra — CRM de WhatsApp" },
      { name: "twitter:description", content: "Automatiza tu WhatsApp con LeadFlow Ultra. CRM premium con respuestas por palabra clave, campañas y gestión de agentes. Escala tus ventas hoy. ¡Únete ya!" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1e0d4357-d238-4398-90d2-a27a4aeaa394/id-preview-7bd60daf--2595f25e-f814-437f-94ac-15689f068935.lovable.app-1776813356957.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1e0d4357-d238-4398-90d2-a27a4aeaa394/id-preview-7bd60daf--2595f25e-f814-437f-94ac-15689f068935.lovable.app-1776813356957.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster richColors theme="dark" position="top-right" />
    </AuthProvider>
  );
}
