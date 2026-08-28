import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

type Plan = "trial" | "vip" | "pro" | "elite";

interface ClientRow {
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  org_id: string;
  org_name: string;
  plan_type: Plan;
  org_status: "active" | "suspended";
  created_at: string;
}

const schema = z.object({
  full_name: z.string().trim().min(2).max(100),
  org_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  plan: z.enum(["trial", "vip", "pro", "elite"]),
});

export const Route = createFileRoute("/_app/agent")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id);
    const allowed = (roles ?? []).some(
      (r: { role: string }) => r.role === "agent" || r.role === "superadmin",
    );
    if (!allowed) throw redirect({ to: "/dashboard" });
  },
  component: AgentPanel,
});

function AgentPanel() {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    org_name: "",
    email: "",
    plan: "trial" as Plan,
  });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("agent_list_clients");
    setClients((data as ClientRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const createClient = async () => {
    if (!user) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setCreating(true);

    // Pre-check: organization name must be globally unique to avoid keyword-automation cross-talk.
    const { data: taken } = await supabase.rpc("org_name_exists", { _name: parsed.data.org_name });
    if (taken) {
      setCreating(false);
      return toast.error(
        `El nombre del negocio "${parsed.data.org_name}" ya está en uso. Elige otro para evitar mezclar automatizaciones.`,
      );
    }

    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "invite_client",
        email: parsed.data.email,
        full_name: parsed.data.full_name,
        org_name: parsed.data.org_name,
        plan: parsed.data.plan,
        redirect_to: `${window.location.origin}/accept-invite`,
      },
    });
    if (error || (data as { error?: string })?.error) {
      setCreating(false);
      return toast.error(error?.message ?? (data as { error?: string })?.error ?? "Error al invitar cliente");
    }
    toast.success(
      `Invitación enviada a ${parsed.data.email} con licencia ${parsed.data.plan.toUpperCase()}`,
    );
    setForm({ full_name: "", org_name: "", email: "", plan: "trial" });
    setCreating(false);
    load();
  };

  const setPlan = async (orgId: string, plan: Plan) => {
    const { error } = await supabase.rpc("agent_set_client_plan", { _org_id: orgId, _plan: plan });
    if (error) return toast.error(error.message);
    toast.success("Plan actualizado");
    load();
  };

  const toggleStatus = async (orgId: string, current: "active" | "suspended") => {
    const next = current === "active" ? "suspended" : "active";
    const { error } = await supabase.rpc("agent_set_client_status", { _org_id: orgId, _status: next });
    if (error) return toast.error(error.message);
    toast.success(`Cliente ${next === "active" ? "activado" : "suspendido"}`);
    load();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <BackToDashboard />
      <PageHeader
        title="Panel Agente"
        description="Crea clientes, asigna licencias y gestiona accesos"
        action={
          <div className="flex items-center gap-2">
            <Badge className="bg-success/15 text-success border-success/30">
              {clients.length} {clients.length === 1 ? "cliente" : "clientes"}
            </Badge>
            <Badge className="bg-primary/15 text-primary border-primary/30">
              <Briefcase className="w-3 h-3 mr-1" /> Agente
            </Badge>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        <div className="glass rounded-2xl p-6 space-y-4 h-fit">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" /> Nuevo cliente
          </h3>
          <div>
            <Label>Nombre del responsable</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Nombre del negocio</Label>
            <Input value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} />
          </div>
          <div>
            <Label>Email de acceso</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Licencia</Label>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value as Plan })}
              className="mt-1 w-full px-3 py-2 rounded-md bg-input border border-border text-sm"
            >
              <option value="trial">Trial — 10 mensajes/día</option>
              <option value="vip">VIP — 150 mensajes/día</option>
              <option value="pro">Pro — 200 mensajes/día</option>
              <option value="elite">Elite — Ilimitado</option>
            </select>
          </div>
          <Button onClick={createClient} disabled={creating} className="w-full gradient-brand text-background border-0">
            {creating ? "Enviando invitación..." : "Crear e invitar cliente"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Recibirá un email para establecer su contraseña y acceder con la licencia ya activa.
          </p>
        </div>

        <div className="glass rounded-2xl overflow-hidden h-fit">
          <div className="p-5 border-b border-border">
            <h3 className="font-bold text-lg">Mis clientes ({clients.length})</h3>
          </div>
          <div className="divide-y divide-border">
            {loading && (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            )}
            {!loading && clients.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">Aún no has creado clientes.</p>
            )}
            {!loading &&
              clients.map((c) => (
                <div key={c.org_id} className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-medium truncate">{c.full_name || c.email || c.org_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.email ?? "—"} · {c.org_name}
                    </div>
                  </div>
                  <select
                    value={c.plan_type}
                    onChange={(e) => setPlan(c.org_id, e.target.value as Plan)}
                    className="px-3 py-1.5 rounded-md bg-input border border-border text-sm"
                  >
                    <option value="trial">Trial</option>
                    <option value="vip">VIP</option>
                    <option value="pro">Pro</option>
                    <option value="elite">Elite</option>
                  </select>
                  <Badge
                    className={
                      c.org_status === "active"
                        ? "bg-success/20 text-success border-success/30"
                        : "bg-destructive/20 text-destructive border-destructive/30"
                    }
                  >
                    {c.org_status === "active" ? "Activo" : "Suspendido"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => toggleStatus(c.org_id, c.org_status)}>
                    {c.org_status === "active" ? "Suspender" : "Activar"}
                  </Button>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}