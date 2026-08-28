import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Webhook, CheckCircle2, Loader2, Copy, KeyRound, Save, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_VERIFY_TOKEN = "LeadFlowoficial2026";
const cleanPhone = (value: string) => value.replace(/\D/g, "");

export const Route = createFileRoute("/_app/whatsapp")({
  component: WhatsAppHub,
});

type MetaConfig = {
  id: string | null;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  verify_token: string;
};

function WhatsAppHub() {
  const { organization, user } = useAuth();
  const [config, setConfig] = useState<MetaConfig>({
    id: null,
    phone_number_id: "",
    waba_id: "",
    access_token: "",
    verify_token: DEFAULT_VERIFY_TOKEN,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingInbound, setTestingInbound] = useState(false);
  const [testTo, setTestTo] = useState("");

  const webhookUrl = organization?.id
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook?org_id=${organization.id}`
    : "";

  const reload = async () => {
    if (!organization?.id) return;
    try {
      const { data } = await supabase
        .from("whatsapp_meta_config")
        .select("*")
        .eq("org_id", organization.id)
        .maybeSingle();
      if (data) {
        setConfig({
          id: (data as any).id,
          phone_number_id: (data as any).phone_number_id ?? "",
          waba_id: (data as any).waba_id ?? "",
          access_token: (data as any).access_token ?? "",
          verify_token: (data as any).verify_token ?? DEFAULT_VERIFY_TOKEN,
        });
      }
    } catch (e) {
      console.warn("[whatsapp] reload error:", e);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (!organization) {
      setLoading(false);
      return;
    }
    (async () => {
      try { await reload(); } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization]);

  const save = async () => {
    if (!organization) return;
    setSaving(true);
    const payload = {
      org_id: organization.id,
      phone_number_id: config.phone_number_id.trim() || null,
      waba_id: config.waba_id.trim() || null,
      access_token: config.access_token.trim() || null,
      verify_token: config.verify_token.trim() || DEFAULT_VERIFY_TOKEN,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = config.id
      ? await supabase.from("whatsapp_meta_config").update(payload).eq("id", config.id).select().maybeSingle()
      : await supabase.from("whatsapp_meta_config").upsert(payload, { onConflict: "org_id" }).select().maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (data) setConfig((c) => ({ ...c, id: (data as any).id }));
    toast.success("✓ Credenciales guardadas");
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL del webhook copiada");
  };

  const copyVerifyToken = () => {
    navigator.clipboard.writeText(config.verify_token || DEFAULT_VERIFY_TOKEN);
    toast.success("Verify token copiado");
  };

  const sendTest = async () => {
    if (!user || !testTo.trim()) {
      toast.error("Ingresa un número de prueba");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-handler", {
        body: { user_id: user.id, numero: testTo.trim(), mensaje: "✅ Prueba desde tu CRM (Meta Cloud API)" },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.ok) toast.success("Mensaje de prueba enviado");
      else toast.error((data as any)?.error || "Error enviando prueba");
    } catch (e: any) {
      toast.error(e?.message || "Error enviando prueba");
    } finally {
      setTesting(false);
    }
  };

  const testInboundWebhook = async () => {
    if (!config.phone_number_id.trim()) {
      toast.error("Guarda el Phone Number ID antes de probar la recepción");
      return;
    }
    setTestingInbound(true);
    try {
      const testPhone = cleanPhone(testTo) || "50400000000";
      const testMessageId = `wamid.CRM_INBOUND_TEST_${Date.now()}`;
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object: "whatsapp_business_account",
          entry: [{
            id: config.waba_id || "CRM_TEST_WABA",
            changes: [{
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "0000000000",
                  phone_number_id: config.phone_number_id.trim(),
                },
                contacts: [{ profile: { name: "Prueba Meta CRM" }, wa_id: testPhone }],
                messages: [{
                  from: testPhone,
                  id: testMessageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: "prueba recepción meta crm" },
                  type: "text",
                }],
              },
            }],
          }],
        }),
      });
      if (!res.ok) throw new Error(`Webhook respondió ${res.status}`);
      const { data, error } = await supabase
        .from("messages_log")
        .select("id")
        .eq("org_id", organization!.id)
        .eq("provider_message_id", testMessageId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("La prueba llegó al webhook pero no apareció en mensajes");
      toast.success("Recepción comprobada: el mensaje entró al CRM");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo probar la recepción");
    } finally {
      setTestingInbound(false);
    }
  };

  const isConfigured = !!(config.phone_number_id && config.access_token);

  if (!user || !organization) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <BackToDashboard />
        <PageHeader title="WhatsApp Hub" description="Cargando tu espacio…" />
        <div className="space-y-4 mt-6">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <BackToDashboard />
      <PageHeader
        title="WhatsApp Hub"
        description="Conecta tu CRM con la API Oficial de WhatsApp (Meta Cloud API)"
        action={
          <Badge
            variant={isConfigured ? "default" : "secondary"}
            className={isConfigured ? "bg-success text-background" : ""}
          >
            {isConfigured ? "● Configurado" : "● Sin configurar"}
          </Badge>
        }
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <Tabs defaultValue="meta">
          <TabsList className="grid grid-cols-2 w-full mb-6 glass">
            <TabsTrigger value="meta"><KeyRound className="w-4 h-4 mr-2" /> Credenciales Meta</TabsTrigger>
            <TabsTrigger value="webhook"><Webhook className="w-4 h-4 mr-2" /> Webhook</TabsTrigger>
          </TabsList>

          <TabsContent value="meta">
            <div className="glass rounded-2xl p-6 space-y-5">
              <div>
                <h3 className="font-bold text-lg mb-1">Credenciales de Meta Cloud API</h3>
                <p className="text-sm text-muted-foreground">
                  Pega aquí tus llaves de Meta Developers. Estas credenciales se usan para enviar
                  mensajes desde tu CRM hacia WhatsApp.
                </p>
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-xs text-primary hover:underline mt-1"
                >
                  Abrir Meta Developers <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>

              <div className="grid gap-4">
                <div>
                  <Label htmlFor="phone_number_id">Phone Number ID</Label>
                  <Input
                    id="phone_number_id"
                    value={config.phone_number_id}
                    onChange={(e) => setConfig((c) => ({ ...c, phone_number_id: e.target.value }))}
                    placeholder="1095558040308933"
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="waba_id">WABA ID (WhatsApp Business Account)</Label>
                  <Input
                    id="waba_id"
                    value={config.waba_id}
                    onChange={(e) => setConfig((c) => ({ ...c, waba_id: e.target.value }))}
                    placeholder="1567917921656719"
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="access_token">Access Token (Bearer Token)</Label>
                  <Input
                    id="access_token"
                    type="password"
                    value={config.access_token}
                    onChange={(e) => setConfig((c) => ({ ...c, access_token: e.target.value }))}
                    placeholder="EAAG..."
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Lo encuentras en Meta Developers → tu app → WhatsApp → API Setup.
                  </p>
                </div>
              </div>

              <Button
                onClick={save}
                disabled={saving}
                className="gradient-brand text-background border-0 w-full"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar credenciales
              </Button>

              {isConfigured && (
                <div className="rounded-2xl border border-success/30 bg-success/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <span className="font-semibold">Listo para enviar mensajes</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="Número de prueba (ej: 50488513164)"
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      className="font-mono"
                    />
                    <Button onClick={sendTest} disabled={testing} variant="outline">
                      {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Enviar prueba
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="webhook">
            <div className="glass rounded-2xl p-6 space-y-5">
              <div>
                <h3 className="font-bold text-lg mb-1">URL del Webhook del CRM</h3>
                <p className="text-sm text-muted-foreground">
                  Pega esta URL en Meta Developers → tu app → WhatsApp → Configuration → Callback URL.
                </p>
              </div>

              <div>
                <Label>Callback URL</Label>
                <div className="flex flex-col sm:flex-row gap-2 mt-1">
                  <Input
                    readOnly
                    value={webhookUrl}
                    className="font-mono text-xs bg-background"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button type="button" variant="outline" onClick={copyUrl}>
                    <Copy className="w-4 h-4 mr-1" /> Copiar
                  </Button>
                </div>
              </div>

              <div>
                <Label>Verify Token</Label>
                <div className="flex flex-col sm:flex-row gap-2 mt-1">
                  <Input
                    readOnly
                    value={config.verify_token || DEFAULT_VERIFY_TOKEN}
                    className="font-mono text-xs bg-background"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button type="button" variant="outline" onClick={copyVerifyToken}>
                    <Copy className="w-4 h-4 mr-1" /> Copiar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pega este token en el campo "Verify token" cuando configures el webhook en Meta.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm space-y-2">
                <p className="font-medium">Pasos rápidos en Meta Developers:</p>
                <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1">
                  <li>Entra a tu app → WhatsApp → Configuration.</li>
                  <li>En "Callback URL" pega la URL de arriba.</li>
                  <li>En "Verify token" pega el token de arriba y guarda.</li>
                  <li>Suscribe el campo <span className="font-mono">messages</span> en tu WABA.</li>
                </ol>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={testInboundWebhook}
                disabled={testingInbound || !webhookUrl || !config.phone_number_id}
                className="w-full"
              >
                {testingInbound ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Probar recepción en el CRM
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
