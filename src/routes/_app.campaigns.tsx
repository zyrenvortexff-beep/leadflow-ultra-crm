import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useDailyUsage } from "@/lib/use-daily-usage";
import { invokeFunction } from "@/lib/functions";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Calendar, Users, Zap, Trash2, Clock, CheckCircle2, Lock,
  Contact as ContactIcon, Pencil, Send, Image as ImageIcon, Loader2, X
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

function localInputToUtcIso(localStr: string): string | null {
  if (!localStr) return null;
  const d = new Date(localStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function utcIsoToLocalInput(isoStr: string | null): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultScheduleLocal(): string {
  const d = new Date(Date.now() + 10 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowPlusMinLocal(minutesAhead = 1): string {
  const d = new Date(Date.now() + minutesAhead * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Campaign {
  id: string;
  name: string;
  message_body: string;
  media_url?: string | null;
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    name: "",
    message_body: "Hola {nombre_cliente}, tenemos una promoción especial para ti 🎉",
    media_url: "",
    target_tags: [] as string[],
    schedule_time: defaultScheduleLocal(),
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("leadflow_draft_campaign");
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm((prev) => ({ ...prev, ...parsed, schedule_time: defaultScheduleLocal() }));
      }
    } catch { /* ignore */ }
  }, []);

  const updateForm = (patch: Partial<typeof form>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem("leadflow_draft_campaign", JSON.stringify({
          name: next.name,
          message_body: next.message_body,
          media_url: next.media_url,
        }));
      } catch { /* ignore */ }
      return next;
    });
  };

  const minScheduleLocal = useMemo(() => nowPlusMinLocal(1), []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona una imagen válida");
      return;
    }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `campaigns/${organization.id}_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from("crm-media").upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      const { data: pubUrl } = supabase.storage.from("crm-media").getPublicUrl(data.path);
      setForm((prev) => ({ ...prev, media_url: pubUrl.publicUrl }));
      toast.success("Imagen de campaña cargada");
    } catch (err: any) {
      toast.error("Error al subir imagen: " + (err?.message || ""));
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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

  const validateScheduleTime = (local: string): boolean => {
    if (!local) return true;
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
      media_url: form.media_url.trim() || null,
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
    try { localStorage.removeItem("leadflow_draft_campaign"); } catch { /* ignore */ }
    setForm({
      name: "",
      message_body: "Hola {nombre_cliente}, tenemos una promoción especial para ti 🎉",
      media_url: "",
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
    toast.success("Enviando campaña masiva ahora…");
    const { error: fnErr } = await invokeFunction("campaigns-dispatch", {
      campaign_id: inserted.id,
    });
    if (fnErr) toast.error("Error al disparar el envío: " + (fnErr.message || fnErr));
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
    const { error: fnErr } = await invokeFunction("campaigns-dispatch", { campaign_id: c.id });
    if (fnErr) return toast.error("Error al disparar el envío: " + (fnErr.message || fnErr));
    toast.success("Enviando campaña ahora…");
    setTimeout(load, 1500);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
  };

  const scheduleDisabled = usage?.reached || Boolean(form.schedule_time && form.schedule_time < minScheduleLocal);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <BackToDashboard />
      <PageHeader
        title="Campañas Masivas"
        description="Envíos masivos y difusiones programadas con soporte para fotos y texto personalizado"
      />

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="glass rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-lg">Nueva Campaña</h3>
          <div>
            <Label>Nombre de la campaña</Label>
            <Input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} placeholder="Promo Primavera 2026" className="mt-1" />
          </div>
          <div>
            <Label>Mensaje (o pie de foto si adjuntas imagen)</Label>
            <Textarea value={form.message_body} onChange={(e) => updateForm({ message_body: e.target.value })}
              rows={4} placeholder="Usa {nombre_cliente} para personalizar" className="mt-1 resize-none" />
            <p className="text-xs text-muted-foreground mt-1">Variables disponibles: {"{nombre_cliente}"}, {"{telefono}"}</p>
          </div>
          <div>
            <Label className="flex items-center justify-between">
              <span>Imagen adjunta (opcional)</span>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="h-7 text-xs"
              >
                {uploadingImage ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ImageIcon className="w-3 h-3 mr-1" />}
                Subir foto
              </Button>
            </Label>
            <div className="flex gap-2 items-center mt-1">
              <Input
                value={form.media_url}
                onChange={(e) => updateForm({ media_url: e.target.value })}
                placeholder="https://... o sube una imagen arriba"
                className="text-xs font-mono"
              />
              {form.media_url && (
                <Button type="button" variant="ghost" size="icon" onClick={() => updateForm({ media_url: "" })} className="h-9 w-9 shrink-0">
                  <X className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
            </div>
            {form.media_url && (
              <div className="mt-2 rounded-xl overflow-hidden border border-border h-24 w-40">
                <img src={form.media_url} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
          <div>
            <Label>Audiencia</Label>
            <div className="flex gap-1 mt-2 p-1 bg-secondary rounded-lg">
              {([["contacts", "Contactos guardados"], ["manual", "Lista manual"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setAudience(k)}
                  className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${audience === k ? "bg-primary text-background font-semibold" : "text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
            {audience === "contacts" && (
              <div className="mt-3 max-h-44 overflow-auto border border-border rounded-xl divide-y divide-border/60 bg-background/30">
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
                    <span className="text-xs text-muted-foreground font-mono">+{c.phone}</span>
                  </label>
                ))}
              </div>
            )}
            {audience === "manual" && (
              <Textarea value={manualNumbers} onChange={(e) => setManualNumbers(e.target.value)}
                rows={3} placeholder={"+50499887766\n+50488776655"} className="mt-3 font-mono text-xs" />
            )}
          </div>
          <div>
            <Label>Programar envío (hora local)</Label>
            <Input type="datetime-local" value={form.schedule_time}
              min={minScheduleLocal} step={60}
              onChange={(e) => setForm({ ...form, schedule_time: e.target.value })} className="mt-1" />
          </div>
          {usage && !usage.unlimited && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Mensajes hoy</span><span>{usage.used} / {usage.limit}</span>
              </div>
              <Progress value={usage.percent} className="h-1.5" />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button onClick={schedule} disabled={scheduleDisabled || uploadingImage} size="sm" variant="outline" className="flex-1">
              {usage?.reached ? <Lock className="w-4 h-4 mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
              {usage?.reached ? "Límite" : "Programar"}
            </Button>
            <Button onClick={sendImmediately} disabled={usage?.reached || uploadingImage} size="sm"
              className="flex-1 gradient-brand text-background border-0">
              <Zap className="w-4 h-4 mr-1.5" /> Enviar ahora
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 px-2">
            <h3 className="font-bold text-lg">Historial de Campañas</h3>
            <Badge variant="secondary" className="gap-1.5 whitespace-nowrap text-xs">
              <Clock className="w-3 h-3" /> Auto-despacho en {nextCheckIn}s
            </Badge>
          </div>
          {loading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
          {!loading && list.length === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">No hay campañas creadas aún</div>
          )}
          {!loading && list.map((c) => {
            const isDone = c.status === "sent" || c.status === "completed";
            const inFlight = c.status === "scheduled" && c.sent_count > 0 && c.sent_count < c.total_leads;
            const progressPct = c.total_leads > 0 ? Math.round((c.sent_count / c.total_leads) * 100) : 0;
            const remaining = c.status === "scheduled" ? formatRemaining(c.schedule_time) : null;
            return (
              <div key={c.id} className="glass rounded-2xl p-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h4 className="font-bold truncate">{c.name}</h4>
                    {c.media_url && <span className="text-[10px] text-primary shrink-0 flex items-center">📷 Foto</span>}
                  </div>
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
                    <button type="button" onClick={() => removeCampaign(c.id)} title="Eliminar"
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{c.message_body}</p>
                {inFlight && (
                  <div className="mb-2">
                    <Progress value={progressPct} className="h-1.5" />
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-1">
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
    </div>
  );
}
