import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Contact, Upload, Plus, Trash2, Phone, Mail, Pencil } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { z } from "zod";

interface ContactRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tags: string[] | null;
  notes: string | null;
}

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^[+\d][\d\s\-()]{5,20}$/, "Teléfono inválido"),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  tags: z.string().max(255).optional(),
});

export const Route = createFileRoute("/_app/contacts")({
  component: Contacts,
});

function normalizePhone(p: string) {
  return p.replace(/[^\d+]/g, "");
}

function Contacts() {
  const { organization } = useAuth();
  const [list, setList] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", phone: "", email: "", tags: "" });
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", tags: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!organization) return;
    setLoading(true);
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("org_id", organization.id)
      .order("created_at", { ascending: false });
    setList((data as ContactRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization]);

  const add = async () => {
    if (!organization) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const tags = (parsed.data.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("contacts").insert({
      org_id: organization.id,
      name: parsed.data.name,
      phone: normalizePhone(parsed.data.phone),
      email: parsed.data.email || null,
      tags,
    });
    if (error) return toast.error(error.message);
    toast.success("Contacto agregado");
    setForm({ name: "", phone: "", email: "", tags: "" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar contacto?")) return;
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const openEdit = (c: ContactRow) => {
    setEditing(c);
    setEditForm({
      name: c.name,
      phone: c.phone,
      email: c.email ?? "",
      tags: (c.tags ?? []).join(", "),
    });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const parsed = schema.safeParse(editForm);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const tags = (parsed.data.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("contacts").update({
      name: parsed.data.name,
      phone: normalizePhone(parsed.data.phone),
      email: parsed.data.email || null,
      tags,
      updated_at: new Date().toISOString(),
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Contacto actualizado");
    setEditing(null);
    load();
  };

  const importCsv = async (file: File) => {
    if (!organization) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (rows.length === 0) return;
    // Detect header
    const first = rows[0].toLowerCase();
    const start = first.includes("name") || first.includes("nombre") || first.includes("phone") || first.includes("tel") ? 1 : 0;
    const records: { org_id: string; name: string; phone: string; email: string | null; tags: string[] }[] = [];
    for (let i = start; i < rows.length; i++) {
      const cols = rows[i].split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      const [name, phone, email, tagStr] = cols;
      if (!name || !phone) continue;
      records.push({
        org_id: organization.id,
        name,
        phone: normalizePhone(phone),
        email: email || null,
        tags: tagStr ? tagStr.split("|").map((t) => t.trim()).filter(Boolean) : [],
      });
    }
    if (records.length === 0) return toast.error("CSV vacío o inválido");
    const { error, count } = await supabase
      .from("contacts")
      .upsert(records, { onConflict: "org_id,phone", ignoreDuplicates: true, count: "exact" });
    if (error) return toast.error(error.message);
    toast.success(`${count ?? records.length} contactos importados`);
    load();
  };

  const filtered = list.filter(
    (c) =>
      !filter ||
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      c.phone.includes(filter) ||
      (c.email ?? "").toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <BackToDashboard />
      <PageHeader
        title="Contactos"
        description="Agrega manualmente o importa tu lista de WhatsApp"
        action={
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="gap-2"
          >
            <Upload className="w-4 h-4" /> Importar CSV
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
                e.target.value = "";
              }}
            />
          </Button>
        }
      />

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        <div className="glass rounded-2xl p-6 space-y-4 h-fit">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> Nuevo contacto
          </h3>
          <div>
            <Label>Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Juan Pérez" />
          </div>
          <div>
            <Label>Teléfono (con código de país)</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+50499887766" />
          </div>
          <div>
            <Label>Email (opcional)</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Etiquetas (separadas por coma)</Label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, abril" />
          </div>
          <Button onClick={add} className="w-full gradient-brand text-background border-0">
            Agregar
          </Button>
          <p className="text-xs text-muted-foreground">
            Formato CSV: <code>nombre,teléfono,email,etiqueta1|etiqueta2</code>
          </p>
        </div>

        <div className="space-y-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email"
          />
          {loading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          {!loading && filtered.length === 0 && (
            <div className="glass rounded-2xl p-12 text-center text-sm text-muted-foreground">
              <Contact className="w-10 h-10 mx-auto mb-3 opacity-40" />
              No hay contactos. Agrega o importa tu primera lista.
            </div>
          )}
          {!loading &&
            filtered.map((c) => (
              <div key={c.id} className="glass rounded-2xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>
                    {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                  </div>
                  {c.tags && c.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {c.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)} title="Editar">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)} title="Eliminar">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div>
              <Label>Etiquetas (separadas por coma)</Label>
              <Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} />
            </div>
            <Button onClick={saveEdit} className="w-full gradient-brand text-background border-0">
              Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}