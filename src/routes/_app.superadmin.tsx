import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, Users, Trash2, Server, CheckCircle2, AlertTriangle, RefreshCw, Zap, XCircle, Inbox } from "lucide-react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Org {
  id: string;
  name: string;
  plan_type: "trial" | "vip" | "pro" | "elite";
  status: "active" | "suspended";
  created_at: string;
}

interface UserRow {
  user_id: string;
  email: string;
  full_name: string | null;
  org_id: string | null;
  org_name: string | null;
  plan_type: "trial" | "vip" | "pro" | "elite" | null;
  org_status: "active" | "suspended" | null;
  role: "superadmin" | "client_admin" | "agent" | null;
  created_at: string;
  agent_id: string | null;
}

export const Route = createFileRoute("/_app/superadmin")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id);
    const isSuper = (roles ?? []).some((r: { role: string }) => r.role === "superadmin");
    if (!isSuper) throw redirect({ to: "/dashboard" });
  },
  component: Superadmin,
});

function Superadmin() {
  const { isSuperadmin, user: currentUser } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [globalUrl, setGlobalUrl] = useState("");
  const [globalId, setGlobalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [failedLogs, setFailedLogs] = useState<Array<{
    id: string; org_id: string; recipient: string | null; content: string | null;
    error_message: string | null; timestamp: string;
  }>>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Webhook crudo recibido del VPS — diagnóstico Whapi-style
  const [webhookLogs, setWebhookLogs] = useState<Array<{
    id: string; created_at: string; event: string | null; instance: string | null;
    org_id: string | null; from_number: string | null; text_content: string | null;
    matched_keyword: string | null; processing_result: string | null; raw_payload: any;
  }>>([]);
  const [whLoading, setWhLoading] = useState(false);
  const [openRaw, setOpenRaw] = useState<string | null>(null);

  // Test de Conexión Real (envía a 50488513164 y muestra cada paso)
  const [testRunning, setTestRunning] = useState(false);
  const [testSteps, setTestSteps] = useState<Array<{ label: string; ok: boolean; detail?: string }>>([]);

  const runLiveTest = async () => {
    if (!currentUser?.id) {
      toast.error("Sesión no detectada");
      return;
    }
    setTestRunning(true);
    setTestSteps([]);
    const push = (s: { label: string; ok: boolean; detail?: string }) =>
      setTestSteps((prev) => [...prev, s]);

    push({ label: "Llamando a Meta Graph API (/{phone_number_id})…", ok: true });
    try {
      const { data, error } = await supabase.functions.invoke("meta-test", {
        body: { user_id: currentUser.id },
      });
      if (error) {
        push({ label: "Error de red", ok: false, detail: error.message });
      } else if (!(data as any)?.ok) {
        push({
          label: "Meta rechazó la conexión",
          ok: false,
          detail: `${(data as any)?.error ?? "desconocido"}${(data as any)?.code ? ` (code ${(data as any).code})` : ""}`,
        });
      } else {
        const d = data as any;
        push({ label: `Token Maestro válido (${d.ms}ms)`, ok: true, detail: `Phone ID ${d.phone_number_id}` });
        push({
          label: "Número activo en Meta",
          ok: true,
          detail: `${d.verified_name ?? "(sin nombre)"} · +${d.display_phone_number ?? "?"} · calidad: ${d.quality_rating ?? "n/a"}`,
        });
        toast.success("Conexión Meta Cloud API verificada ✔");
      }
    } catch (e) {
      push({ label: "Excepción inesperada", ok: false, detail: (e as Error).message });
    } finally {
      setTestRunning(false);
      loadFailedLogs();
    }
  };

  const loadFailedLogs = async () => {
    setLogsLoading(true);
    const { data } = await supabase
      .from("messages_log")
      .select("id, org_id, recipient, content, error_message, timestamp")
      .eq("direction", "outbound")
      .eq("status", "failed")
      .order("timestamp", { ascending: false })
      .limit(50);
    setFailedLogs((data as any) ?? []);
    setLogsLoading(false);
  };

  const loadWebhookLogs = async () => {
    setWhLoading(true);
    // Solo errores: omitimos eventos OK (received:*, sent, no_keyword_match, skipped:*, connection.update*)
    // para reducir uso de almacenamiento y créditos.
    const { data } = await supabase
      .from("webhook_logs" as any)
      .select("id, created_at, event, instance, org_id, from_number, text_content, matched_keyword, processing_result, raw_payload")
      .or(
        "processing_result.ilike.error%," +
        "processing_result.ilike.%fail%," +
        "processing_result.ilike.%exception%," +
        "processing_result.ilike.meta_%," +
        "event.ilike.error%"
      )
      .order("created_at", { ascending: false })
      .limit(50);
    setWebhookLogs((data as any) ?? []);
    setWhLoading(false);
  };

  const load = async () => {
    setLoading(true);
    const [{ data: o }, { data: g }, { data: u }] = await Promise.all([
      supabase.from("organizations").select("*").order("created_at", { ascending: false }),
      supabase.from("global_settings").select("*").limit(1).maybeSingle(),
      supabase.rpc("admin_list_users"),
    ]);
    setOrgs((o as Org[]) ?? []);
    setUsers((u as UserRow[]) ?? []);
    if (g) {
      setGlobalUrl(g.evolution_base_url ?? "");
      setGlobalId(g.id);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    loadFailedLogs();
    loadWebhookLogs();
  }, []);

  // Build agent list (users with role=agent) for the filter dropdown
  const agents = users.filter((u) => u.role === "agent");
  const filteredUsers = users.filter((u) => {
    if (agentFilter === "all") return true;
    if (agentFilter === "none") return !u.agent_id && u.role !== "agent";
    if (agentFilter === "_agents_only") return u.role === "agent";
    return u.agent_id === agentFilter;
  });

  const toggleOrgStatus = async (orgId: string, current: "active" | "suspended" | null) => {
    const next = current === "active" ? "suspended" : "active";
    const { error } = await supabase.rpc("admin_set_org_status", { _org_id: orgId, _status: next });
    if (error) return toast.error(error.message);
    toast.success(`Acceso ${next === "active" ? "activado" : "suspendido"}`);
    load();
  };

  const updatePlan = async (id: string, plan: Org["plan_type"]) => {
    const { error } = await supabase.from("organizations").update({ plan_type: plan }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Plan actualizado");
    load();
  };

  const updateRole = async (userId: string, role: "superadmin" | "client_admin" | "agent") => {
    const { error } = await supabase.rpc("admin_set_user_role", { _user_id: userId, _role: role });
    if (error) return toast.error(error.message);
    toast.success("Rol actualizado");
    load();
  };

  const deleteUser = async (userId: string, label: string) => {
    setDeleting(userId);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "delete_user", user_id: userId },
    });
    setDeleting(null);
    if (error || (data as { error?: string })?.error) {
      return toast.error(error?.message ?? (data as { error?: string })?.error ?? "Error al eliminar");
    }
    toast.success(`Usuario ${label} eliminado permanentemente`);
    load();
  };

  const saveGlobal = async () => {
    if (!globalId) {
      const { error } = await supabase.from("global_settings").insert({ evolution_base_url: globalUrl });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("global_settings")
        .update({ evolution_base_url: globalUrl, updated_at: new Date().toISOString() })
        .eq("id", globalId);
      if (error) return toast.error(error.message);
    }
    toast.success("URL global actualizada");
    load();
  };

  if (!isSuperadmin) return null;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <BackToDashboard />
      <PageHeader
        title="Panel Maestro"
        description="Control total de la plataforma"
        action={
          <Badge className="bg-accent/20 text-accent border-accent/30">
            <Shield className="w-3 h-3 mr-1" /> Superadmin
          </Badge>
        }
      />

      <div className="glass rounded-2xl p-6 mb-6 space-y-4">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" /> Estado Global de Meta Cloud API
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Cada organización configura su propio Phone Number ID y Access Token desde
            <span className="font-medium"> WhatsApp Hub</span>. Aquí puedes verificar la conexión
            con la Graph API de Meta en tiempo real.
          </p>
        </div>

        <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
          <div>
            Los <span className="font-semibold">Access Tokens</span> de cada cliente se guardan
            cifrados por organización en <span className="font-mono">whatsapp_meta_config</span>.
            Esta plataforma ya no depende de un servidor VPS Evolution.
          </div>
        </div>

        {/* Test de Conexión Real */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h4 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Test de Conexión Real · Meta Cloud API
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                Llama a <span className="font-mono">/v20.0/{`{phone_number_id}`}</span> usando tu
                Access Token y muestra el número verificado, calidad y latencia.
              </p>
            </div>
            <Button
              onClick={runLiveTest}
              disabled={testRunning}
              className="gradient-brand text-background border-0"
            >
              {testRunning ? (
                <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Ejecutando…</>
              ) : (
                <><Zap className="w-4 h-4 mr-1" /> Ejecutar Test</>
              )}
            </Button>
          </div>

          {testSteps.length > 0 && (
            <div className="space-y-1.5 rounded-lg bg-background/50 border border-border p-3 font-mono text-xs">
              {testSteps.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  {s.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={s.ok ? "text-foreground" : "text-destructive font-semibold"}>
                      {s.label}
                    </div>
                    {s.detail && (
                      <div className="text-muted-foreground break-all">{s.detail}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-border">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> Organizaciones ({orgs.length})
          </h3>
        </div>
        <div className="divide-y divide-border">
          {loading && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          )}
          {!loading && orgs.map((org) => (
            <div key={org.id} className="p-4 flex items-center gap-4 hover:bg-secondary/30">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{org.name}</div>
                <div className="text-xs text-muted-foreground">
                  Creada {new Date(org.created_at).toLocaleDateString("es")}
                </div>
              </div>
              <Badge
                variant={org.status === "active" ? "default" : "secondary"}
                className={
                  org.status === "active"
                    ? "bg-success/20 text-success border-success/30"
                    : "bg-destructive/20 text-destructive border-destructive/30"
                }
              >
                {org.status === "active" ? "Activa" : "Suspendida"}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Usuarios registrados */}
      <div className="glass rounded-2xl overflow-hidden mt-6">
        <div className="p-6 border-b border-border flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-accent" /> Usuarios registrados ({filteredUsers.length}/{users.length})
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Filtra por agente para ver únicamente sus clientes.
            </p>
          </div>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="px-3 py-2 rounded-md bg-input border border-border text-sm min-w-[220px]"
          >
            <option value="all">Todos los usuarios</option>
            <option value="_agents_only">Solo agentes</option>
            <option value="none">Sin agente (clientes directos)</option>
            {agents.length > 0 && <option disabled>──── Clientes por agente ────</option>}
            {agents.map((a) => (
              <option key={a.user_id} value={a.user_id}>
                Clientes de {a.full_name || a.email}
              </option>
            ))}
          </select>
        </div>
        <div className="divide-y divide-border">
          {loading && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          )}
          {!loading && filteredUsers.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">No hay usuarios para este filtro.</p>
          )}
          {!loading &&
            filteredUsers.map((u) => (
              <div key={u.user_id} className="p-4 flex flex-wrap items-center gap-3 hover:bg-secondary/30">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium truncate">{u.full_name || u.email}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {u.email} · {u.org_name ?? "Sin organización"}
                  </div>
                </div>
                {u.org_id && (
                  <select
                    value={u.plan_type ?? "trial"}
                    onChange={(e) => updatePlan(u.org_id!, e.target.value as Org["plan_type"])}
                    className="px-3 py-1.5 rounded-md bg-input border border-border text-sm"
                  >
                    <option value="trial">Trial</option>
                    <option value="vip">VIP</option>
                    <option value="pro">Pro</option>
                    <option value="elite">Elite</option>
                  </select>
                )}
                <select
                  value={u.role ?? "client_admin"}
                  onChange={(e) =>
                    updateRole(u.user_id, e.target.value as "superadmin" | "client_admin" | "agent")
                  }
                  className="px-3 py-1.5 rounded-md bg-input border border-border text-sm"
                >
                  <option value="agent">Agente</option>
                  <option value="client_admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
                {u.role === "agent" && (
                  <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
                    Agente
                  </Badge>
                )}
                {u.agent_id && (
                  <Badge variant="secondary" className="text-[10px]">
                    Creado por agente
                  </Badge>
                )}
                <Badge
                  variant={u.org_status === "active" ? "default" : "secondary"}
                  className={
                    u.org_status === "suspended"
                      ? "bg-destructive/20 text-destructive border-destructive/30"
                      : "bg-success/20 text-success border-success/30"
                  }
                >
                  {u.org_status === "suspended" ? "Suspendido" : "Activo"}
                </Badge>
                {u.org_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleOrgStatus(u.org_id!, u.org_status)}
                  >
                    {u.org_status === "active" ? "Suspender" : "Activar"}
                  </Button>
                )}
                {u.user_id !== currentUser?.id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 border-destructive/30"
                        disabled={deleting === u.user_id}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar usuario permanentemente</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se borrarán <span className="font-semibold">{u.full_name || u.email}</span>,
                          su organización y TODOS sus datos (leads, contactos, campañas, mensajes,
                          automatizaciones). Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteUser(u.user_id, u.full_name || u.email)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Eliminar todo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Logs de envío fallidos (whatsapp-handler + campaigns) */}
      <div className="glass rounded-2xl overflow-hidden mt-6">
        <div className="p-6 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Logs de envío fallidos ({failedLogs.length})
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Últimos 50 mensajes salientes con error. Útil para diagnosticar tokens vencidos,
              ventana de 24h cerrada (131047) o permisos insuficientes en Meta Cloud API.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={loadFailedLogs} disabled={logsLoading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${logsLoading ? "animate-spin" : ""}`} />
            Refrescar
          </Button>
        </div>
        <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
          {!logsLoading && failedLogs.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Sin envíos fallidos recientes. 🎉
            </p>
          )}
          {failedLogs.map((l) => {
            const orgName = orgs.find((o) => o.id === l.org_id)?.name ?? l.org_id.slice(0, 8);
            return (
              <div key={l.id} className="p-4 text-sm space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{new Date(l.timestamp).toLocaleString("es")}</span>
                  <span>·</span>
                  <span className="font-medium text-foreground">{orgName}</span>
                  <span>·</span>
                  <span className="font-mono">→ {l.recipient ?? "(sin destinatario)"}</span>
                </div>
                <div className="text-destructive text-xs font-mono break-all">
                  {l.error_message ?? "(sin error)"}
                </div>
                {l.content && (
                  <div className="text-muted-foreground text-xs truncate">
                    “{l.content.slice(0, 120)}{l.content.length > 120 ? "…" : ""}”
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Logs de Webhook Meta — eventos crudos recibidos desde Meta Cloud API */}
      <div className="glass rounded-2xl overflow-hidden mt-6">
        <div className="p-6 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Inbox className="w-5 h-5 text-destructive" /> Errores de Webhook Meta ({webhookLogs.length})
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Solo se muestran webhooks con error (token vencido, payload inválido, excepciones).
              Los eventos OK se omiten para ahorrar almacenamiento y créditos.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={loadWebhookLogs} disabled={whLoading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${whLoading ? "animate-spin" : ""}`} />
            Refrescar
          </Button>
        </div>
        <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
          {!whLoading && webhookLogs.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Sin errores recientes en el webhook de Meta. 🎉
            </p>
          )}
          {webhookLogs.map((l) => {
            const isOpen = openRaw === l.id;
            const orgName = l.org_id ? (orgs.find((o) => o.id === l.org_id)?.name ?? l.org_id.slice(0, 8)) : "(sin org)";
            const result = l.processing_result || "—";
            const ok = result === "sent" || result === "no_keyword_match" || result?.startsWith("connection.update");
            return (
              <div key={l.id} className="p-4 text-sm space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{new Date(l.created_at).toLocaleString("es")}</span>
                  <span>·</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{l.event || "—"}</Badge>
                  <span className="font-medium text-foreground">{orgName}</span>
                  {l.from_number && (<><span>·</span><span className="font-mono">de +{l.from_number}</span></>)}
                  <span>·</span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${ok ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                    {result}
                  </Badge>
                  {l.matched_keyword && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">kw: {l.matched_keyword}</Badge>
                  )}
                </div>
                {l.text_content && (
                  <div className="text-foreground text-xs">
                    “{l.text_content.slice(0, 200)}{l.text_content.length > 200 ? "…" : ""}”
                  </div>
                )}
                <button
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setOpenRaw(isOpen ? null : l.id)}
                >
                  {isOpen ? "Ocultar JSON" : "Ver JSON crudo"}
                </button>
                {isOpen && (
                  <pre className="text-[10px] bg-black/40 border border-border rounded-lg p-3 overflow-x-auto max-h-72">
                    {JSON.stringify(l.raw_payload, null, 2)}
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