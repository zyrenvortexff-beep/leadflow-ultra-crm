import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Bot, RefreshCw, Pencil, X, Save, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface Automation {
  id: string;
  user_id?: string | null;
  trigger_keyword: string;
  response_text: string;
  media_url: string | null;
  link_regalo?: string | null;
  tag_to_apply?: string | null;
  is_active: boolean;
  delay_seconds: number;
}

export const Route = createFileRoute("/_app/automations")({
  component: Automations,
});

function Automations() {
  const { organization, user } = useAuth();
  const [list, setList] = useState<Automation[]>([]);
  const [form, setForm] = useState({
    trigger_keyword: "",
    response_text: "Hola {nombre}, gracias por tu mensaje 👋",
    media_url: "",
    link_regalo: "",
    tag_to_apply: "",
    is_active: true,
    delay_seconds: 2,
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("leadflow_draft_automation");
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm((prev) => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);

  const updateForm = (patch: Partial<typeof form>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (!editingId) {
        try {
          localStorage.setItem("leadflow_draft_automation", JSON.stringify({
            trigger_keyword: next.trigger_keyword,
            response_text: next.response_text,
            media_url: next.media_url,
            link_regalo: next.link_regalo,
            tag_to_apply: next.tag_to_apply,
          }));
        } catch { /* ignore */ }
      }
      return next;
    });
  };

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [botActive, setBotActive] = useState<boolean | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = () => {
    try { localStorage.removeItem("leadflow_draft_automation"); } catch { /* ignore */ }
    setEditingId(null);
    setForm({
      trigger_keyword: "",
      response_text: "Hola {nombre}, gracias por tu mensaje 👋",
      media_url: "",
      link_regalo: "",
      tag_to_apply: "",
      is_active: true,
      delay_seconds: 2,
    });
  };

  const startEdit = (a: Automation) => {
    setEditingId(a.id);
    setForm({
      trigger_keyword: a.trigger_keyword || "",
      response_text: a.response_text || "",
      media_url: a.media_url || "",
      link_regalo: a.link_regalo || "",
      tag_to_apply: a.tag_to_apply || "",
      is_active: a.is_active,
      delay_seconds: a.delay_seconds ?? 2,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
      const filePath = `automations/${organization.id}_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from("crm-media").upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      const { data: pubUrl } = supabase.storage.from("crm-media").getPublicUrl(data.path);
      setForm((prev) => ({ ...prev, media_url: pubUrl.publicUrl }));
      toast.success("Imagen subida correctamente");
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
    const [{ data }, cfgRes] = await Promise.all([
      supabase
        .from("automations")
        .select("*")
        .eq("org_id", organization.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("whatsapp_meta_config")
        .select("phone_number_id, access_token")
        .eq("org_id", organization.id)
        .maybeSingle(),
    ]);
    setList((data as Automation[]) ?? []);
    const cfg = cfgRes.data as any;
    setBotActive(!!(cfg?.phone_number_id && cfg?.access_token));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [organization]);

  useEffect(() => {
    if (!organization?.id) return;
    const channel = supabase
      .channel(`automations-${organization.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automations", filter: `org_id=eq.${organization.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Automation;
            setList((prev) => (prev.some((x) => x.id === row.id) ? prev : [row, ...prev]));
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Automation;
            setList((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as Automation;
            setList((prev) => prev.filter((x) => x.id !== row.id));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organization?.id]);

  const repairConnection = async () => {
    setRepairing(true);
    const tId = toast.loading("Verificando configuración de Meta…");
    try {
      await load();
      if (botActive) toast.success("Bot activo: escuchando palabras clave.", { id: tId });
      else toast.error("Configura tus credenciales de Meta en WhatsApp Hub.", { id: tId });
    } catch (e: any) {
      setBotActive(false);
      toast.error(e?.message || "Error verificando configuración", { id: tId });
    } finally {
      setRepairing(false);
    }
  };

  const save = async () => {
    if (!organization || !user) return;
    if (!form.trigger_keyword.trim() || !form.response_text.trim()) {
      return toast.error("Completa palabra clave y mensaje");
    }
    setSaving(true);
    const payload = {
      org_id: organization.id,
      user_id: user.id,
      trigger_keyword: form.trigger_keyword.trim(),
      response_text: form.response_text.trim(),
      media_url: form.media_url.trim() || null,
      link_regalo: form.link_regalo.trim() || null,
      tag_to_apply: form.tag_to_apply.trim() || null,
      is_active: form.is_active,
      delay_seconds: form.delay_seconds,
    };

    if (editingId) {
      const { error } = await supabase
        .from("automations")
        .update(payload)
        .eq("id", editingId);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Automatización actualizada");
      resetForm();
      load();
      return;
    }

    const { data: inserted, error } = await supabase
      .from("automations")
      .insert(payload)
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Automatización creada");
    resetForm();
    if (inserted) {
      setList((prev) => [inserted as Automation, ...prev]);
    } else {
      load();
    }
  };

  const toggle = async (a: Automation) => {
    setList((prev) => prev.map((item) => item.id === a.id ? { ...item, is_active: !a.is_active } : item));
    await supabase.from("automations").update({ is_active: !a.is_active }).eq("id", a.id);
  };

  const remove = async (id: string) => {
    await supabase.from("automations").delete().eq("id", id);
    toast.success("Eliminada");
    if (editingId === id) resetForm();
    load();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <BackToDashboard />
      <PageHeader
        title="Automatizaciones"
        description="Respuestas automáticas inteligentes con texto, imágenes y etiquetas"
        action={
          <div className="flex items-center gap-2">
            <Badge variant={botActive ? "default" : "secondary"} className={botActive ? "bg-success text-background" : ""}>
              Bot Activo: {botActive ? "SÍ" : "NO"}
            </Badge>
            {!botActive && (
              <Button size="sm" variant="outline" onClick={repairConnection} disabled={repairing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${repairing ? "animate-spin" : ""}`} />
                Reparar Conexión
              </Button>
            )}
          </div>
        }
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-6">
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">
                {editingId ? "Editar automatización" : "Nueva automatización"}
              </h3>
              {editingId && (
                <Button size="sm" variant="ghost" onClick={resetForm}>
                  <X className="w-4 h-4 mr-1" /> Cancelar
                </Button>
              )}
            </div>
            <div>
              <Label>Palabra clave (disparador)</Label>
              <Input
                value={form.trigger_keyword}
                onChange={(e) => updateForm({ trigger_keyword: e.target.value })}
                placeholder="precio, info, catalogo, hola..."
                className="mt-1"
              />
            </div>
            <div>
              <Label>Mensaje de respuesta</Label>
              <Textarea
                value={form.response_text}
                onChange={(e) => updateForm({ response_text: e.target.value })}
                rows={4}
                placeholder="Usa {nombre} para personalizar"
                className="mt-1 resize-none"
              />
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
              <Input
                value={form.media_url}
                onChange={(e) => updateForm({ media_url: e.target.value })}
                placeholder="https://... o sube una imagen arriba"
                className="mt-1 text-xs font-mono"
              />
            </div>
            <div>
              <Label>Link regalo / CTA (opcional)</Label>
              <Input
                value={form.link_regalo}
                onChange={(e) => updateForm({ link_regalo: e.target.value })}
                placeholder="https://tu-link.com/regalo"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Etiqueta a aplicar (opcional)</Label>
              <Input
                value={form.tag_to_apply}
                onChange={(e) => updateForm({ tag_to_apply: e.target.value })}
                placeholder="Ej: CURSO, PRECIO, INTERESADO"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Delay (segundos)</Label>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  step={1}
                  inputMode="numeric"
                  value={form.delay_seconds}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      delay_seconds: e.target.value === "" ? 0 : Math.max(0, Math.min(60, parseInt(e.target.value) || 0)),
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div className="flex items-end gap-3 pb-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label>Activa</Label>
              </div>
            </div>
            <Button
              onClick={save}
              disabled={saving || uploadingImage}
              className="w-full gradient-brand text-background border-0"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : editingId ? (
                <><Save className="w-4 h-4 mr-2" /> Guardar cambios</>
              ) : (
                <><Plus className="w-4 h-4 mr-2" /> Crear automatización</>
              )}
            </Button>
          </div>

          <div className="glass rounded-2xl p-4">
            <h4 className="font-semibold mb-3 px-2">Tus automatizaciones</h4>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {loading && (
                <>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </>
              )}
              {!loading && list.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aún no hay automatizaciones
                </p>
              )}
              {!loading && list.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-center gap-3 p-3 rounded-xl bg-secondary/40 ${
                    editingId === a.id ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <Bot className="w-4 h-4 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate flex items-center gap-2">
                      <span className="truncate">{a.trigger_keyword}</span>
                      {a.tag_to_apply && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          🏷 {a.tag_to_apply}
                        </Badge>
                      )}
                      {a.media_url && (
                        <span className="text-[10px] text-primary shrink-0 flex items-center">
                          📷 Foto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{a.response_text}</p>
                  </div>
                  <Switch checked={a.is_active} onCheckedChange={() => toggle(a)} />
                  <button
                    onClick={() => startEdit(a)}
                    className="text-muted-foreground hover:text-primary p-1"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* iPhone Preview */}
        <div className="lg:sticky lg:top-8 self-start">
          <h3 className="font-bold text-lg mb-4 text-center">Vista previa en WhatsApp</h3>
          <IPhonePreview text={form.response_text} mediaUrl={form.media_url} linkRegalo={form.link_regalo} />
        </div>
      </div>
    </div>
  );
}

function IPhonePreview({ text, mediaUrl, linkRegalo }: { text: string; mediaUrl?: string | null; linkRegalo?: string | null }) {
  const preview = text.replace(/\{nombre\}/g, "Carlos").replace(/\{nombre_cliente\}/g, "Carlos");
  return (
    <div className="mx-auto w-[290px] h-[600px] rounded-[3rem] bg-neutral-900 border-[10px] border-neutral-800 shadow-2xl shadow-primary/20 overflow-hidden relative">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full z-10" />
      <div className="h-full bg-[#0b141a] flex flex-col">
        <div className="bg-[#202c33] px-4 pt-9 pb-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full gradient-brand" />
          <div>
            <div className="text-white text-sm font-medium">Mi Empresa</div>
            <div className="text-[10px] text-emerald-400">en línea</div>
          </div>
        </div>
        <div
          className="flex-1 p-3 space-y-2 overflow-y-auto"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          <div className="flex justify-end">
            <div className="bg-[#005c4b] text-white text-xs px-3 py-2 rounded-lg max-w-[80%]">
              Hola, ¿tienen información disponible?
            </div>
          </div>
          <div className="flex justify-start">
            <div className="bg-[#202c33] text-white text-xs px-3 py-2 rounded-lg max-w-[88%] space-y-2">
              {mediaUrl && (
                <div className="rounded overflow-hidden">
                  <img
                    src={mediaUrl}
                    alt="media"
                    className="rounded max-h-36 w-full object-cover"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                </div>
              )}
              <div className="whitespace-pre-wrap">{preview || "Tu mensaje aparecerá aquí..."}</div>
              {linkRegalo && (
                <a href={linkRegalo} target="_blank" rel="noreferrer" className="block text-primary text-[11px] underline truncate pt-1">
                  {linkRegalo}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}