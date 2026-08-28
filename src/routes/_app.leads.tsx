import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Phone, Mail, Tag, Pencil, Trash2, Link2, UserPlus } from "lucide-react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";

type Status = "nuevo" | "interesado" | "cliente" | "perdido";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tags: string[];
  status: Status;
  notes: string | null;
  last_contact: string | null;
}

const COLUMNS: { key: Status; label: string; color: string }[] = [
  { key: "nuevo", label: "Nuevo", color: "bg-primary/15 text-primary border-primary/30" },
  { key: "interesado", label: "Interesado", color: "bg-warning/15 text-warning border-warning/30" },
  { key: "cliente", label: "Cliente", color: "bg-success/15 text-success border-success/30" },
  { key: "perdido", label: "Perdido", color: "bg-destructive/15 text-destructive border-destructive/30" },
];

export const Route = createFileRoute("/_app/leads")({
  component: LeadsKanban,
});

function LeadsKanban() {
  const { organization } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<{ id: string; content: string; direction: string; timestamp: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", tags: "" });
  const [editing, setEditing] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", tags: "" });
  const [linkOpen, setLinkOpen] = useState<Lead | null>(null);
  const [contactsList, setContactsList] = useState<{ id: string; name: string; phone: string; email: string | null }[]>([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importSearch, setImportSearch] = useState("");
  const [importSelected, setImportSelected] = useState<string[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    if (!organization) return;
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("org_id", organization.id)
      .order("created_at", { ascending: false });
    setLeads((data as Lead[]) ?? []);
  };

  useEffect(() => {
    load();
  }, [organization]);

  useEffect(() => {
    if (!selected) return;
    supabase
      .from("messages_log")
      .select("*")
      .eq("lead_id", selected.id)
      .order("timestamp", { ascending: true })
      .then(({ data }) => setMessages((data as typeof messages) ?? []));
  }, [selected]);

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const newStatus = e.over.id as Status;
    const id = e.active.id as string;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === newStatus) return;
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
    const { error } = await supabase
      .from("leads")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Error al mover");
    else toast.success(`Movido a ${newStatus}`);
  };

  const createLead = async () => {
    if (!organization || !form.name || !form.phone) {
      toast.error("Nombre y teléfono son requeridos");
      return;
    }
    const { error } = await supabase.from("leads").insert({
      org_id: organization.id,
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    if (error) return toast.error(error.message);
    toast.success("Lead creado");
    setCreateOpen(false);
    setForm({ name: "", phone: "", email: "", tags: "" });
    load();
  };

  const saveNotes = async (notes: string) => {
    if (!selected) return;
    await supabase.from("leads").update({ notes }).eq("id", selected.id);
    setSelected({ ...selected, notes });
    toast.success("Notas guardadas");
  };

  const openEdit = (l: Lead) => {
    setEditing(l);
    setEditForm({
      name: l.name,
      phone: l.phone,
      email: l.email ?? "",
      tags: (l.tags ?? []).join(", "),
    });
  };
  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.name || !editForm.phone) return toast.error("Nombre y teléfono son requeridos");
    const tags = editForm.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("leads").update({
      name: editForm.name,
      phone: editForm.phone,
      email: editForm.email || null,
      tags,
      updated_at: new Date().toISOString(),
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Lead actualizado");
    setEditing(null);
    if (selected?.id === editing.id) setSelected({ ...selected, name: editForm.name, phone: editForm.phone, email: editForm.email || null, tags });
    load();
  };
  const removeLead = async (id: string) => {
    if (!confirm("¿Eliminar este lead? Esta acción es permanente.")) return;
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lead eliminado");
    if (selected?.id === id) setSelected(null);
    setLeads((prev) => prev.filter((x) => x.id !== id));
  };

  const openLink = async (l: Lead) => {
    if (!organization) return;
    setLinkOpen(l);
    setLinkSearch("");
    const { data } = await supabase
      .from("contacts")
      .select("id,name,phone,email")
      .eq("org_id", organization.id)
      .order("name");
    setContactsList(data ?? []);
  };

  const linkContact = async (c: { name: string; phone: string; email: string | null }) => {
    if (!linkOpen) return;
    const { error } = await supabase.from("leads").update({
      name: c.name,
      phone: c.phone,
      email: c.email,
      updated_at: new Date().toISOString(),
    }).eq("id", linkOpen.id);
    if (error) return toast.error(error.message);
    toast.success("Contacto vinculado al lead");
    setLinkOpen(null);
    if (selected?.id === linkOpen.id) {
      setSelected({ ...selected, name: c.name, phone: c.phone, email: c.email });
    }
    load();
  };

  const openImport = async () => {
    if (!organization) return;
    setImportSelected([]);
    setImportSearch("");
    setImportOpen(true);
    const { data } = await supabase
      .from("contacts")
      .select("id,name,phone,email")
      .eq("org_id", organization.id)
      .order("name");
    setContactsList(data ?? []);
  };

  const importAsLeads = async () => {
    if (!organization || importSelected.length === 0) {
      toast.error("Selecciona al menos un contacto");
      return;
    }
    const chosen = contactsList.filter((c) => importSelected.includes(c.id));
    const rows = chosen.map((c) => ({
      org_id: organization.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      status: "nuevo" as const,
    }));
    const { error } = await supabase.from("leads").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} contacto(s) movido(s) al pipeline`);
    setImportOpen(false);
    load();
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <BackToDashboard />
      <PageHeader
        title="Leads"
        description="Arrastra entre columnas para cambiar estado"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openImport}>
              <UserPlus className="w-4 h-4 mr-2" /> Nuevo Lead desde Contactos
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-brand text-background border-0">
                  <Plus className="w-4 h-4 mr-2" /> Nuevo lead
                </Button>
              </DialogTrigger>
              <DialogContent className="glass">
                <DialogHeader>
                  <DialogTitle>Crear lead</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nombre *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Teléfono *</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+52 ..." />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <Label>Tags (separadas por coma)</Label>
                    <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, mexico" />
                  </div>
                  <Button onClick={createLead} className="w-full gradient-brand text-background border-0">
                    Crear
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <Column key={col.key} col={col} leads={leads.filter((l) => l.status === col.key)}
              onClick={setSelected} onEdit={openEdit} onDelete={removeLead} onLink={openLink} />
          ))}
        </div>
      </DndContext>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-3 h-3" /> {selected.phone}
                  </div>
                  {selected.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-3 h-3" /> {selected.email}
                    </div>
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {selected.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selected.tags.map((t) => (
                      <span key={t} className="px-2 py-1 rounded-full text-xs bg-primary/15 text-primary flex items-center gap-1">
                        <Tag className="w-3 h-3" /> {t}
                      </span>
                    ))}
                  </div>
                )}

                <div>
                  <Label>Notas</Label>
                  <Textarea
                    defaultValue={selected.notes ?? ""}
                    onBlur={(e) => saveNotes(e.target.value)}
                    placeholder="Añade notas sobre este lead..."
                    rows={3}
                  />
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2">Historial de mensajes</h4>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {messages.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin mensajes aún</p>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={`p-2 rounded-lg text-sm ${m.direction === "outbound" ? "bg-primary/15 ml-6" : "bg-secondary mr-6"}`}
                        >
                          {m.content}
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {new Date(m.timestamp).toLocaleString("es")}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button variant="outline" className="flex-1" onClick={() => openEdit(selected)}>
                    <Pencil className="w-4 h-4 mr-1.5" /> Editar
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => openLink(selected)}>
                    <Link2 className="w-4 h-4 mr-1.5" /> Vincular
                  </Button>
                  <Button variant="outline" className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => removeLead(selected.id)}>
                    <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Editar lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>Teléfono *</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div>
              <Label>Tags (separadas por coma)</Label>
              <Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} />
            </div>
            <Button onClick={saveEdit} className="w-full gradient-brand text-background border-0">
              Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkOpen} onOpenChange={(o) => !o && setLinkOpen(null)}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Vincular contacto al lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar por nombre o teléfono…"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
            />
            <div className="max-h-72 overflow-auto border border-border rounded-md divide-y divide-border">
              {contactsList.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground text-center">No tienes contactos guardados aún.</p>
              )}
              {contactsList
                .filter((c) =>
                  !linkSearch ||
                  c.name.toLowerCase().includes(linkSearch.toLowerCase()) ||
                  c.phone.includes(linkSearch),
                )
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => linkContact(c)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-secondary/40 text-left"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.phone}</div>
                    </div>
                    <Link2 className="w-4 h-4 text-primary shrink-0" />
                  </button>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Al vincular se reemplazará el nombre, teléfono y email del lead con los del contacto seleccionado.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Mover contactos al pipeline de Leads</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar por nombre o teléfono…"
              value={importSearch}
              onChange={(e) => setImportSearch(e.target.value)}
            />
            <div className="max-h-72 overflow-auto border border-border rounded-md divide-y divide-border">
              {contactsList.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground text-center">No tienes contactos guardados aún.</p>
              )}
              {contactsList
                .filter((c) =>
                  !importSearch ||
                  c.name.toLowerCase().includes(importSearch.toLowerCase()) ||
                  c.phone.includes(importSearch),
                )
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importSelected.includes(c.id)}
                      onChange={(e) =>
                        setImportSelected((s) =>
                          e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id),
                        )
                      }
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.phone}</span>
                  </label>
                ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{importSelected.length} seleccionado(s)</span>
              <Button onClick={importAsLeads} className="gradient-brand text-background border-0">
                <UserPlus className="w-4 h-4 mr-1.5" /> Crear leads
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Column({
  col,
  leads,
  onClick,
  onEdit,
  onDelete,
  onLink,
}: {
  col: { key: Status; label: string; color: string };
  leads: Lead[];
  onClick: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onDelete: (id: string) => void;
  onLink: (l: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div
      ref={setNodeRef}
      className={`glass rounded-2xl p-4 min-h-[60vh] transition-colors ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-sm font-semibold px-2 py-1 rounded-md border ${col.color}`}>
          {col.label}
        </h3>
        <span className="text-xs text-muted-foreground">{leads.length}</span>
      </div>
      <div className="space-y-2">
        {leads.map((l) => (
          <DraggableCard key={l.id} lead={l} onClick={() => onClick(l)}
            onEdit={() => onEdit(l)} onDelete={() => onDelete(l.id)} onLink={() => onLink(l)} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ lead, onClick, onEdit, onDelete, onLink }: {
  lead: Lead; onClick: () => void; onEdit: () => void; onDelete: () => void; onLink: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors group relative"
    >
      <div
        {...attributes}
        {...listeners}
        onClick={onClick}
        className="cursor-grab active:cursor-grabbing pr-16"
      >
        <div className="font-medium text-sm">{lead.name}</div>
        <div className="text-xs text-muted-foreground mt-1">{lead.phone}</div>
        {lead.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lead.tags.slice(0, 2).map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" onClick={(e) => { e.stopPropagation(); onLink(); }}
          title="Vincular contacto" className="p-1 rounded hover:bg-primary/10 text-primary">
          <Link2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Editar" className="p-1 rounded hover:bg-secondary text-muted-foreground">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Eliminar" className="p-1 rounded hover:bg-destructive/10 text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}