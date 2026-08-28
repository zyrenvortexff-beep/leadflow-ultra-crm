import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UsersRound, Plus, Trash2, Pencil, ExternalLink, Copy, Check,
  Sparkles, Save, X, MessageSquare, Tag, Users
} from "lucide-react";
import { toast } from "sonner";

interface WhatsAppGroup {
  id: string;
  org_id: string;
  name: string;
  group_url: string;
  description: string | null;
  keyword_trigger: string | null;
  tag_to_apply: string | null;
  max_members: number;
  clicks_count: number;
  is_active: boolean;
  created_at: string;
}

export const Route = createFileRoute("/_app/groups")({
  component: WhatsAppGroups,
});

function WhatsAppGroups() {
  const { organization } = useAuth();
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    group_url: "",
    description: "",
    keyword_trigger: "",
    tag_to_apply: "GRUPO_VIP",
    max_members: 1024,
    is_active: true,
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      group_url: "",
      description: "",
      keyword_trigger: "",
      tag_to_apply: "GRUPO_VIP",
      max_members: 1024,
      is_active: true,
    });
  };

  const startEdit = (g: WhatsAppGroup) => {
    setEditingId(g.id);
    setForm({
      name: g.name,
      group_url: g.group_url,
      description: g.description || "",
      keyword_trigger: g.keyword_trigger || "",
      tag_to_apply: g.tag_to_apply || "GRUPO_VIP",
      max_members: g.max_members || 1024,
      is_active: g.is_active,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const load = async () => {
    if (!organization) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_groups" as any)
      .select("*")
      .eq("org_id", organization.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setGroups(data as unknown as WhatsAppGroup[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [organization]);

  const save = async () => {
    if (!organization) return;
    if (!form.name.trim() || !form.group_url.trim()) {
      return toast.error("El nombre y el enlace del grupo son obligatorios");
    }
    if (!form.group_url.includes("chat.whatsapp.com")) {
      toast.warning("El enlace suele ser del formato: https://chat.whatsapp.com/XXXXX");
    }

    setSaving(true);
    const payload = {
      org_id: organization.id,
      name: form.name.trim(),
      group_url: form.group_url.trim(),
      description: form.description.trim() || null,
      keyword_trigger: form.keyword_trigger.trim() || null,
      tag_to_apply: form.tag_to_apply.trim() || "GRUPO_VIP",
      max_members: Number(form.max_members) || 1024,
      is_active: form.is_active,
    };

    if (editingId) {
      const { error } = await supabase
        .from("whatsapp_groups" as any)
        .update(payload)
        .eq("id", editingId);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Grupo actualizado");
      resetForm();
      load();
      return;
    }

    const { data: inserted, error } = await supabase
      .from("whatsapp_groups" as any)
      .insert(payload)
      .select()
      .single();

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Grupo de WhatsApp registrado con éxito");
    resetForm();
    load();
  };

  const toggleStatus = async (g: WhatsAppGroup) => {
    setGroups((prev) => prev.map((item) => (item.id === g.id ? { ...item, is_active: !g.is_active } : item)));
    await supabase.from("whatsapp_groups" as any).update({ is_active: !g.is_active }).eq("id", g.id);
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este grupo del CRM?")) return;
    await supabase.from("whatsapp_groups" as any).delete().eq("id", id);
    toast.success("Grupo eliminado");
    if (editingId === id) resetForm();
    load();
  };

  const copyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success("Enlace copiado al portapapeles");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <BackToDashboard />
      <PageHeader
        title="Grupos de WhatsApp"
        description="Gestiona enlaces de invitación, rotación de comunidades y auto-unión de leads"
      />

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Formulario */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <UsersRound className="w-5 h-5 text-primary" />
              {editingId ? "Editar Grupo" : "Registrar Nuevo Grupo"}
            </h3>
            {editingId && (
              <Button size="sm" variant="ghost" onClick={resetForm}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
            )}
          </div>

          <div>
            <Label>Nombre del Grupo</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Comunidad VIP - Clientes 2026"
              className="mt-1"
            />
          </div>

          <div>
            <Label>Enlace de Invitación de WhatsApp</Label>
            <Input
              value={form.group_url}
              onChange={(e) => setForm({ ...form, group_url: e.target.value })}
              placeholder="https://chat.whatsapp.com/L1234567890ABC"
              className="mt-1 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Obtén este enlace en la info del grupo de WhatsApp &gt; Enlace de invitación.
            </p>
          </div>

          <div>
            <Label>Descripción / Propósito (opcional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Grupo exclusivo para avisos de ofertas y webinars..."
              className="mt-1 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Palabra clave disparadora</Label>
              <Input
                value={form.keyword_trigger}
                onChange={(e) => setForm({ ...form, keyword_trigger: e.target.value })}
                placeholder="Ej: GRUPO, VIP"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Etiqueta al unirse</Label>
              <Input
                value={form.tag_to_apply}
                onChange={(e) => setForm({ ...form, tag_to_apply: e.target.value })}
                placeholder="GRUPO_VIP"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 items-center pt-1">
            <div>
              <Label>Capacidad máxima</Label>
              <Input
                type="number"
                value={form.max_members}
                onChange={(e) => setForm({ ...form, max_members: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Grupo Activo para Enlaces</Label>
            </div>
          </div>

          <Button
            onClick={save}
            disabled={saving}
            className="w-full gradient-brand text-background border-0 pt-1"
          >
            {editingId ? (
              <><Save className="w-4 h-4 mr-2" /> Guardar cambios</>
            ) : (
              <><Plus className="w-4 h-4 mr-2" /> Registrar Grupo</>
            )}
          </Button>
        </div>

        {/* Lista de Grupos */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="font-bold text-lg">Tus Grupos y Comunidades</h3>
            <Badge variant="secondary">{groups.length} Registrados</Badge>
          </div>

          {loading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}

          {!loading && groups.length === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground space-y-2">
              <Users className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <p>No has registrado ningún grupo de WhatsApp todavía.</p>
              <p className="text-xs">Añade tu primer enlace de grupo para automatizar invitaciones masivas.</p>
            </div>
          )}

          {!loading && groups.map((g) => (
            <div key={g.id} className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold truncate text-base">{g.name}</h4>
                    <Badge variant={g.is_active ? "default" : "secondary"} className={g.is_active ? "bg-success/20 text-success text-[10px]" : "text-[10px]"}>
                      {g.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  {g.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{g.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyUrl(g.id, g.group_url)}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition"
                    title="Copiar enlace"
                  >
                    {copiedId === g.id ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={g.group_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition"
                    title="Abrir enlace"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => startEdit(g)}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(g.id)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-background/40 border border-border/60 flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-primary truncate">{g.group_url}</span>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap pt-1">
                {g.keyword_trigger && (
                  <span className="flex items-center gap-1 bg-secondary/80 px-2 py-0.5 rounded text-[11px]">
                    <MessageSquare className="w-3 h-3 text-primary" />
                    Keyword: <strong className="text-foreground">{g.keyword_trigger}</strong>
                  </span>
                )}
                {g.tag_to_apply && (
                  <span className="flex items-center gap-1 bg-secondary/80 px-2 py-0.5 rounded text-[11px]">
                    <Tag className="w-3 h-3 text-accent" />
                    Tag: <strong className="text-foreground">{g.tag_to_apply}</strong>
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px]">
                  <Users className="w-3 h-3" />
                  Máx: {g.max_members} miembros
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
