import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Shield, Target, Eye, Scale, Zap } from "lucide-react";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Legal & Términos — LeadFlow Ultra" },
      { name: "description", content: "Misión, visión, términos de uso, atención al cliente y políticas de LeadFlow Ultra." },
      { property: "og:title", content: "Legal & Términos — LeadFlow Ultra" },
      { property: "og:description", content: "Misión, visión, términos de uso, atención al cliente y políticas de LeadFlow Ultra." },
    ],
  }),
  component: LegalPage,
});

function LegalPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-5">
          <Link to="/" className="text-lg font-bold text-gradient tracking-tight">LeadFlow Ultra</Link>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-primary transition-colors">Iniciar sesión</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Información Legal & Corporativa</h1>
          <p className="text-muted-foreground mt-2">Última actualización: {new Date().toLocaleDateString("es")}</p>
        </div>

        <section className="glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2"><Target className="w-5 h-5 text-primary" /><h2 className="text-xl font-bold">Misión</h2></div>
          <p className="text-muted-foreground leading-relaxed">
            Empoderar a negocios con automatización de WhatsApp 24/7, simplificando la gestión de
            leads y conversaciones para que cada empresa pueda enfocarse en lo que importa: vender más
            y atender mejor a sus clientes.
          </p>
        </section>

        <section className="glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2"><Eye className="w-5 h-5 text-accent" /><h2 className="text-xl font-bold">Visión</h2></div>
          <p className="text-muted-foreground leading-relaxed">
            Ser el CRM líder en gestión de mensajería inteligente para 2028, ofreciendo a miles de
            negocios una plataforma confiable, segura y escalable de automatización conversacional.
          </p>
        </section>

        <section className="glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary" /><h2 className="text-xl font-bold">Atención al Cliente</h2></div>
          <p className="text-muted-foreground">
            Para soporte técnico, dudas de facturación o consultas comerciales escríbenos a:
          </p>
          <a href="mailto:zentrycompany3@gmail.com"
             className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors font-medium">
            <Mail className="w-4 h-4" /> zentrycompany3@gmail.com
          </a>
        </section>

        <section className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2"><Zap className="w-5 h-5 text-warning" /><h2 className="text-xl font-bold">Límites de mensajes por licencia</h2></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { plan: "Trial", limit: "10 / día", color: "bg-muted text-muted-foreground" },
              { plan: "VIP", limit: "150 / día", color: "bg-primary/15 text-primary" },
              { plan: "Pro", limit: "200 / día", color: "bg-success/15 text-success" },
              { plan: "Elite", limit: "Ilimitado ∞", color: "bg-accent/15 text-accent" },
            ].map((p) => (
              <div key={p.plan} className="border border-border rounded-xl p-4 text-center">
                <div className={`inline-block px-2 py-0.5 rounded text-xs font-bold tracking-wider ${p.color}`}>{p.plan.toUpperCase()}</div>
                <div className="text-lg font-bold mt-2">{p.limit}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">El contador se reinicia automáticamente cada día a las 00:00 UTC.</p>
        </section>

        <section className="glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2"><Scale className="w-5 h-5 text-primary" /><h2 className="text-xl font-bold">Términos de Uso</h2></div>
          <ol className="list-decimal pl-5 space-y-2 text-muted-foreground text-sm leading-relaxed">
            <li>El usuario se compromete a usar LeadFlow Ultra solo para mensajería legítima y con consentimiento previo de los destinatarios.</li>
            <li>Está prohibido el envío de spam, contenido fraudulento, ilegal, ofensivo o que viole los Términos de Servicio de WhatsApp.</li>
            <li>Cada licencia tiene un cupo diario de mensajes. Excederlo bloquea automáticamente nuevos envíos hasta el siguiente día.</li>
            <li>El usuario es responsable de la información y los números cargados a la plataforma.</li>
            <li>El equipo de LeadFlow Ultra puede suspender cuentas que infrinjan estas reglas, sin reembolso.</li>
          </ol>
        </section>

        <section className="glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-destructive" /><h2 className="text-xl font-bold">Política de Borrado en Cascada</h2></div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Cuando una cuenta es eliminada por el Superadmin o por solicitud del propio usuario, todos los datos
            asociados se borran permanentemente del sistema, incluyendo:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm">
            <li>Perfil de usuario y credenciales de autenticación.</li>
            <li>Organización (si el usuario era el último miembro).</li>
            <li>Leads, contactos, automatizaciones y campañas.</li>
            <li>Historial de mensajes, configuraciones de WhatsApp y métricas de uso.</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Esta acción es <strong>irreversible</strong>. Una vez ejecutada, no es posible recuperar los datos.
          </p>
        </section>

        <section className="glass rounded-2xl p-6 space-y-3">
          <h2 className="text-xl font-bold">Privacidad de datos</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Los datos de contactos y leads cargados por cada organización son privados y aislados por
            organización mediante Row-Level Security. LeadFlow Ultra no comparte ni vende información personal
            a terceros. Los mensajes se transmiten directamente a través de la API oficial de WhatsApp (Meta Cloud API)
            usando los Access Tokens de cada organización.
          </p>
        </section>

        <section id="meta-policies" className="glass rounded-2xl p-6 space-y-4 border border-primary/30">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">📋 Políticas de Uso de Meta para WhatsApp y CRM</h2>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Al utilizar esta plataforma, aceptas cumplir con las estrictas normativas de Meta. El incumplimiento
            de estas reglas puede resultar en la suspensión de tu línea de WhatsApp y tu cuenta publicitaria.
          </p>

          <div>
            <h3 className="font-semibold text-success mb-2">✅ Lo que SÍ puedes hacer (Permitido)</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-sm">
              <li><strong>Enviar mensajes transaccionales y comerciales:</strong> contactar a tus clientes para ventas, soporte o notificaciones a través de la API oficial.</li>
              <li><strong>Medir y crear audiencias:</strong> usar interacciones (compras, clics, mensajes) para crear Audiencias Personalizadas y mejorar la segmentación de anuncios en Facebook e Instagram.</li>
              <li><strong>Compartir datos de contacto de forma segura:</strong> subir nombres, teléfonos y correos siempre que el sistema los encripte (hash) antes de enviarlos a Meta.</li>
              <li><strong>Analizar reportes:</strong> usar las métricas de Meta únicamente para uso interno de tu empresa.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-destructive mb-2">❌ Lo que está estrictamente prohibido (Riesgo de bloqueo inmediato)</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-sm">
              <li><strong>Cero datos sensibles:</strong> prohibido enviar, solicitar o procesar información médica, financiera (tarjetas, cuentas, historiales crediticios) u otros datos altamente confidenciales.</li>
              <li><strong>Cero datos de menores:</strong> prohibido recopilar o enviar información de personas que sepas (o debas saber razonablemente) que son menores de 13 años.</li>
              <li><strong>Cero identificadores gubernamentales:</strong> no puedes solicitar ni transmitir números de seguridad social, pasaportes o IDs gubernamentales restringidas.</li>
              <li><strong>Prohibido vender datos:</strong> no puedes vender, transferir, alquilar ni compartir audiencias, datos de clientes ni reportes de Meta con terceros u otros anunciantes.</li>
              <li><strong>Sitios web ajenos:</strong> no puedes instalar herramientas de rastreo de Meta (como el Píxel) en páginas o apps que no sean de tu propiedad legal.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">⚖️ Tus obligaciones legales como usuario</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-sm">
              <li><strong>Transparencia (aviso de privacidad):</strong> debes tener un aviso de privacidad visible en tu sitio o app que explique que compartes datos con terceros (como Meta) para enviar mensajes o medir anuncios.</li>
              <li><strong>Consentimiento del cliente:</strong> en regiones con leyes estrictas (como Europa/RGPD) debes obtener consentimiento explícito antes de enviar mensajes o rastrear cookies.</li>
              <li><strong>Derecho al olvido:</strong> si un cliente exige ver o eliminar sus datos, tienes la obligación de cumplir con su solicitud.</li>
              <li><strong>Agencias y terceros:</strong> si usas este CRM para administrar clientes de otra empresa, declaras tener autorización legal por escrito para actuar en su nombre.</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-border mt-10">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LeadFlow Ultra. Todos los derechos reservados.
        </div>
      </footer>
    </div>
  );
}