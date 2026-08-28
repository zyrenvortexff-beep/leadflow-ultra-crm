import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw, Info } from "lucide-react";

export const Route = createFileRoute("/_app/errors")({
  component: ErrorsPage,
});

interface MetaError {
  id: string;
  recipient: string | null;
  error_code: string | null;
  error_title: string | null;
  error_detail: string | null;
  message_content: string | null;
  raw: any;
  created_at: string;
}

// Diccionario de códigos comunes de Meta → explicación amigable
const FRIENDLY: Record<string, string> = {
  "131047":
    "La ventana de 24 horas está cerrada. El cliente debe escribirte primero o debes usar una plantilla aprobada.",
  "131051": "Tipo de mensaje no soportado por el destinatario.",
  "131026":
    "El destinatario no se puede recibir mensajes (no tiene WhatsApp o no acepta mensajes de empresas).",
  "131056": "Pareja (tú y este destinatario) excede el límite de mensajes por hora.",
  "100": "Parámetros inválidos en la llamada a Meta. Revisa el número o el contenido.",
  "190": "Access Token inválido o expirado. Genera uno nuevo en Meta Business.",
  "10":
    "Permiso denegado. Verifica que tu aplicación de Meta tenga whatsapp_business_messaging activo.",
  "200": "Permiso requerido faltante en el Access Token.",
};

function ErrorsPage() {
  const { organization } = useAuth();
  const [errors, setErrors] = useState<MetaError[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    if (!organization) return;
    setLoading(true);
    const { data } = await supabase
      .from("meta_errors" as any)
      .select("id,recipient,error_code,error_title,error_detail,message_content,raw,created_at")
      .eq("org_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setErrors((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [organization?.id]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <BackToDashboard />
      <PageHeader
        title="Logs de Error · Meta WhatsApp"
        description="Errores devueltos por la Cloud API de Meta al enviar mensajes"
        action={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refrescar
          </Button>
        }
      />

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm flex items-start gap-2 mb-4">
        <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          Si ves <span className="font-mono">131047</span> significa que la ventana de 24 horas
          está cerrada: pídele al cliente que te escriba primero, o envía una plantilla aprobada.
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {!loading && errors.length === 0 && (
            <p className="p-8 text-sm text-muted-foreground text-center">
              Sin errores recientes. 🎉 Todos los envíos a Meta fueron aceptados.
            </p>
          )}
          {errors.map((e) => {
            const isOpen = openId === e.id;
            const friendly = e.error_code ? FRIENDLY[e.error_code] : null;
            return (
              <div key={e.id} className="p-4 text-sm space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="font-semibold">{e.error_title || "Error de Meta"}</span>
                  {e.error_code && (
                    <Badge variant="outline" className="text-[10px]">
                      code {e.error_code}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto font-mono">
                    {new Date(e.created_at).toLocaleString("es")}
                  </span>
                </div>
                {e.recipient && (
                  <div className="text-xs text-muted-foreground">
                    Destinatario: <span className="font-mono">+{e.recipient}</span>
                  </div>
                )}
                {friendly && (
                  <div className="text-xs rounded-lg bg-warning/10 border border-warning/30 p-2 text-warning-foreground">
                    💡 {friendly}
                  </div>
                )}
                {e.error_detail && (
                  <div className="text-xs text-muted-foreground">{e.error_detail}</div>
                )}
                {e.message_content && (
                  <div className="text-xs text-muted-foreground italic truncate">
                    “{e.message_content.slice(0, 140)}
                    {e.message_content.length > 140 ? "…" : ""}”
                  </div>
                )}
                <button
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setOpenId(isOpen ? null : e.id)}
                >
                  {isOpen ? "Ocultar JSON" : "Ver JSON crudo de Meta"}
                </button>
                {isOpen && (
                  <pre className="text-[10px] bg-black/40 border border-border rounded-lg p-3 overflow-x-auto max-h-72">
                    {JSON.stringify(e.raw, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
