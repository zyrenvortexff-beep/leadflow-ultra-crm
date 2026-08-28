import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone, Calendar, Users, Contact as ContactIcon, Lock,
  Trash2, Zap, CheckCircle2, Pencil, Send, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useDailyUsage } from "@/lib/use-daily-usage";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ---- Helpers ----------------------------------------------------------------

// Returns "yyyy-MM-ddTHH:mm" in LOCAL time, ready for <input type=datetime-local>
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 15));
  d.setSeconds(0, 0);
  return toLocalInput(d);
}

function nowPlusMinLocal(minutes = 1) {
  const d = new Date(Date.now() + minutes * 60_000);
  d.setSeconds(0, 0);
  return toLocalInput(d);
}

// Convert a "datetime-local" string (interpreted in user's local TZ) to UTC ISO
function localInputToUtcIso(local: string): string {
  // new Date("yyyy-MM-ddTHH:mm") is parsed as LOCAL time → toISOString() is UTC
  return new Date(local).toISOString();
}

interface Campaign {
  id: string;
  name: string;
  message_body: string;
  target_tags: string[];
  schedule_time: string | null;
  total_leads: number;
  sent_count: number;
  status: "draft" | "scheduled" | "sent" | "completed";
  sent_at: string | null;
  audience_type?: string;
  contact_ids?: string[];
  manual_numbers?: string[];
}

interface ContactRow { id: string; name: string; phone: string }

export const Route = createFileRoute("/_app/campaigns")({ component: Campaigns });

function Campaigns() {
  const { organization } = useAuth();
  const { usage } = useDailyUsage(organization?.id);
  const [list, setList] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [manualNumbers, setManualNumbers] = useState("");
  const [audience, setAudience] = useState<"contacts" | "manual">("contacts");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [form, setForm] = useState({
    name: "",
    message_body: "Hola {nombre_cliente}, tenemos una promoción especial para ti 🎉",
    target_tags: [] as string[],
    schedule_time: defaultScheduleLocal(),
  });

  const minScheduleLocal = useMemo(() => nowPlusMinLocal(1), []);

  const load = async () => {
    if (!organization) return;
    setLoading(true);
    const [{ data: c }, { data: ct }] = await Promise.all([
      supabase.from("campaigns").select("*").eq("org_id", organization.id).order("created_at", { ascending: false }),
      supabase.from("contacts").select("id,name,phone").eq("org_id", organization.id).order("name"),
    ]);
    setList((c as Campaign[]) ?? []);
    setContacts((ct as ContactRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [organization]);

  useEffect(() => {
    const tick = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const nextCheckIn = useMemo(() => {
    const remaining = 60 - Math.floor((clockNow / 1000) % 60);
    return remaining === 0 ? 60 : remaining;
  }, [clockNow]);

  const formatRemaining = (iso: string | null) => {
    if (!iso) return null;
    const seconds = Math.max(0, Math.ceil((new Date(iso).getTime() - clockNow) / 1000));
    if (seconds <= 0) return "lista para enviar";
    if (seconds < 60) return `en ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (minutes < 60) return `en ${minutes}m ${rest}s`;
    const hours = Math.floor(minutes / 60);
    return `en ${hours}h ${minutes % 60}m`;
  };

  // Realtime: subscribe to campaigns updates so "Enviando X de Y…" updates live.
  useEffect(() => {
    if (!organization?.id) return;
    const channel = supabase
      .channel(`campaigns-${organization.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaigns", filter: `org_id=eq.${organization.id}` },
        (payload) => {
          const updated = payload.new as Campaign;
          setList((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organization?.id]);

  const targetCount = async (): Promise<number> => {
    if (!organization) return 0;
    if (audience === "contacts") return selectedContacts.length;
    return manualNumbers.split(/[\n,;]/).map((s) => s.trim())
      .filter((s) => /^[+\d][\d\s\-()]{5,20}$/.test(s)).length;
  };

  // Common time validation
  const validateScheduleTime = (local: string): boolean => {
    if (!local) return true; // empty = save as draft
    const chosen = new Date(local);
    if (isNaN(chosen.getTime())) {
      toast.error("Fecha inválida");
      return false;
    }
    if (chosen.getTime() <= Date.now()) {
      toast.error("La hora de envío debe ser futura (al menos 1 minuto adelante)");
      return false;
    }
    return true;
  };

  const buildPayload = async (asScheduled: boolean) => {
    const total = await targetCount();
    if (total === 0) {
      toast.error("Sin destinatarios. Selecciona contactos o escribe números.");
      return null;
    }
    if (usage && !usage.unlimited && total > usage.remaining) {
      toast.error(`Tienes ${usage.remaining} mensajes hoy y la campaña requiere ${total}.`);
      return null;
    }
    const manualList = audience === "manual"
      ? manualNumbers.split(/[\n,;]/).map((s) => s.trim()).filter((s) => /^[+\d][\d\s\-()]{5,20}$/.test(s))
      : [];
    return {
      org_id: organization!.id,
      name: form.name,
      message_body: form.message_body,
      target_tags: form.target_tags,
      schedule_time: asScheduled ? localInputToUtcIso(form.schedule_time) : new Date().toISOString(),
      total_leads: total,
      status: "scheduled" as const,
      audience_type: audience,
      contact_ids: audience === "contacts" ? selectedContacts : [],
      manual_numbers: manualList,
    };
  };

  const resetForm = () => {
    setForm({
      name: "",
      message_body: "Hola {nombre_cliente}, tenemos una promoción especial para ti 🎉",
      target_tags: [],
      schedule_time: defaultScheduleLocal(),
    });
    setSelectedContacts([]);
    setManualNumbers("");
    setAudience("contacts");
  };

  const schedule = async () => {
    if (!organization || !form.name || !form.message_body) return toast.error("Nombre y mensaje son requeridos");
    if (usage?.reached) return toast.error("Límite diario alcanzado");
    if (!validateScheduleTime(form.schedule_time)) return;
    const payload = await buildPayload(true);
    if (!payload) return;
    const { error } = await supabase.from("campaigns").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(`Campaña programada (${payload.total_leads} destinatarios)`);
    resetForm();
    load();
  };

  const sendImmediately = async () => {
    if (!organization || !form.name || !form.message_body) return toast.error("Nombre y mensaje son requeridos");
    if (usage?.reached) return toast.error("Límite diario alcanzado");
    const payload = await buildPayload(false);
    if (!payload) return;
    const { data: inserted, error } = await supabase.from("campaigns").insert(payload).select().single();
    if (error || !inserted) return toast.error(error?.message ?? "Error");
    toast.success("Enviando campaña ahora…");
    const { error: fnErr } = await supabase.functions.invoke("campaigns-dispatch", {
      body: { campaign_id: inserted.id },
    });
    if (fnErr) toast.error("Error al disparar el envío: " + fnErr.message);
    resetForm();
    setTimeout(load, 1500);
  };

  const removeCampaign = async (id: string) => {
    if (!confirm("¿Eliminar esta campaña?")) return;
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Campaña eliminada");
    setList((l) => l.filter((x) => x.id !== id));
  };

  const sendNow = async (c: Campaign) => {
    if (usage?.reached) return toast.error("Límite diario alcanzado");
    const { error } = await supabase.from("campaigns")
      .update({ status: "scheduled", schedule_time: new Date().toISOString() }).eq("id", c.id);
    if (error) return toast.error(error.message);
    const { error: fnErr } = await supabase.functions.invoke("campaigns-dispatch", { body: { campaign_id: c.id } });
    if (fnErr) return toast.error("Error al disparar el envío: " + fnErr.message);
    toast.success("Enviando campaña ahora…");
    setTimeout(load, 1500);
  };

  // ---- Edit dialog state ----
  const [editForm, setEditForm] = useState({ name: "", message_body: "", schedule_time: "" });
  const openEdit = (c: Campaign) => {
    setEditing(c);
    setEditForm({
      name: c.name,
      message_body: c.message_body,
      schedule_time: c.schedule_time ? toLocalInput(new Date(c.schedule_time)) : "",
    });
  };
  const saveEdit = async () => {
    if (!editing) return;
    if (editForm.schedule_time && !validateScheduleTime(editForm.schedule_time)) return;
    const { error } = await supabase.from("campaigns").update({
      name: editForm.name,
      message_body: editForm.message_body,
      schedule_time: editForm.schedule_time ? localInputToUtcIso(editForm.schedule_time) : null,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Campaña actualizada");
    setEditing(null);
    load();
  };

  const scheduleDisabled = usage?.reached || !validateLocalSilently(form.schedule_time);
  function validateLocalSilently(local: string) {
    if (!local) return true;
    const t = new Date(local).getTime();
    return !isNaN(t) && t > Date.now();
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <BackToDashboard />
      <PageHeader title="Campañas" description="Envíos masivos por WhatsApp" />

      <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
        ⚠️ <strong>Ventana de 24 horas (Meta Cloud API):</strong> solo puedes enviar texto plano a clientes
        que te hayan escrito en las últimas 24h. Para destinatarios fuera de esa ventana, debes usar una
        <strong> Plantilla aprobada de Meta</strong> o el envío fallará con código <span className="font-mono">131047</span>.
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" /> Nueva campaña
          </h3>
          <div>
            <Label>Nombre interno</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Promo abril 2025" />
          </div>
          <div>
            <Label>Mensaje</Label>
            <Textarea value={form.message_body} onChange={(e) => setForm({ ...form, message_body: e.target.value })}
              rows={5} placeholder="Usa {nombre_cliente} para personalizar" />
            <p className="text-xs text-muted-foreground mt-1">Variables: {"{nombre_cliente}"}, {"{telefono}"}</p>
          </div>
          <div>
            <Label>Audiencia</Label>
            <div className="flex gap-1 mt-2 p-1 bg-secondary rounded-lg">
              {([["contacts", "Contactos"], ["manual", "Manual"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setAudience(k)}
                  className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${audience === k ? "bg-primary text-background" : "text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
            {audience === "contacts" && (
              <div className="mt-3 max-h-44 overflow-auto border border-border rounded-md divide-y divide-border">
                {contacts.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                    <ContactIcon className="w-3 h-3" /> No hay contactos guardados aún.
                  </p>
                )}
                {contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/40 cursor-pointer">
                    <input type="checkbox" checked={selectedContacts.includes(c.id)}
                      onChange={(e) => setSelectedContacts((s) => e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id))} />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.phone}</span>
                  </label>
                ))}
              </div>
            )}
            {audience === "manual" && (
              <Textarea value={manualNumbers} onChange={(e) => setManualNumbers(e.target.value)}
                rows={4} placeholder={"+50499887766\n+50488776655"} className="mt-3 font-mono text-xs" />
            )}
          </div>
          <div>
            <Label>Programar envío (hora local AM/PM)</Label>
            <Input type="datetime-local" value={form.schedule_time}
              min={minScheduleLocal} step={60}
              onChange={(e) => setForm({ ...form, schedule_time: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">
              Zona detectada: <span className="text-primary font-medium">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>. Se guarda en UTC y se muestra en tu hora local. Al menos 1 minuto en el futuro.
            </p>
          </div>
          {usage && !usage.unlimited && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Mensajes hoy</span><span>{usage.used} / {usage.limit}</span>
              </div>
              <Progress value={usage.percent} className="h-1.5" />
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={schedule} disabled={scheduleDisabled} size="sm" variant="outline" className="flex-1">
              {usage?.reached ? <Lock className="w-4 h-4 mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
              {usage?.reached ? "Límite" : "Programar"}
            </Button>
            <Button onClick={sendImmediately} disabled={usage?.reached} size="sm"
              className="flex-1 gradient-brand text-background border-0">
              <Zap className="w-4 h-4 mr-1.5" /> Enviar ahora
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-2">
            <h3 className="font-bold text-lg">Tus campañas</h3>
            <Badge variant="secondary" className="gap-1.5 whitespace-nowrap" title="Sincronizado con el reloj global del minuto">
              <Clock className="w-3 h-3" /> Revisión global en {nextCheckIn}s
            </Badge>
          </div>
          {loading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
          {!loading && list.length === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">No hay campañas aún</div>
          )}
          {!loading && list.map((c) => {
            const isDone = c.status === "sent" || c.status === "completed";
            const inFlight = c.status === "scheduled" && c.sent_count > 0 && c.sent_count < c.total_leads;
            const progressPct = c.total_leads > 0 ? Math.round((c.sent_count / c.total_leads) * 100) : 0;
            const remaining = c.status === "scheduled" ? formatRemaining(c.schedule_time) : null;
            return (
              <div key={c.id} className="glass rounded-2xl p-5">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h4 className="font-bold truncate">{c.name}</h4>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="secondary" className={
                      inFlight ? "bg-primary/20 text-primary border-primary/30 animate-pulse"
                      : c.status === "scheduled" ? "bg-warning/20 text-warning border-warning/30"
                        : isDone ? "bg-success/20 text-success border-success/30" : ""
                    }>
                      {isDone && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {inFlight ? `Enviando ${c.sent_count}/${c.total_leads}` : (c.status === "sent" ? "enviada" : remaining || c.status)}
                    </Badge>
                    {!isDone && !inFlight && (
                      <button type="button" onClick={() => sendNow(c)} title="Enviar ahora"
                        className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors">
                        <Zap className="w-4 h-4" />
                      </button>
                    )}
                    {!isDone && !inFlight && (
                      <button type="button" onClick={() => openEdit(c)} title="Editar"
                        className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {isDone && c.sent_count < c.total_leads && (
                      <button type="button" onClick={() => sendNow(c)} title="Reintentar fallidos"
                        className="p-1.5 rounded-md hover:bg-warning/10 text-warning transition-colors">
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => removeCampaign(c.id)} title="Eliminar"
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.message_body}</p>
                {inFlight && (
                  <div className="mb-3">
                    <Progress value={progressPct} className="h-1.5" />
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {isDone || inFlight ? `${c.sent_count}/${c.total_leads} enviados` : `${c.total_leads} destinatarios`}
                  </span>
                  {c.schedule_time && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(c.schedule_time).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Editar campaña</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>Mensaje</Label>
              <Textarea rows={5} value={editForm.message_body}
                onChange={(e) => setEditForm({ ...editForm, message_body: e.target.value })} />
            </div>
            <div>
              <Label>Programación (hora local)</Label>
              <Input type="datetime-local" value={editForm.schedule_time}
                min={nowPlusMinLocal(1)}
                onChange={(e) => setEditForm({ ...editForm, schedule_time: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} className="gradient-brand text-background border-0">
              <Send className="w-4 h-4 mr-1.5" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
