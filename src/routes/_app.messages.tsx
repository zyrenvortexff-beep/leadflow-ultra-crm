import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  loadCachedMessages,
  saveCachedMessages,
  getLastCachedTimestamp,
  pruneCacheOlderThanDays,
  deleteCachedMessagesByRecipient,
  type CachedMsg,
} from "@/lib/messages-cache";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Send, Search, Check, CheckCheck, Clock, AlertCircle,
  User as UserIcon, Loader2, Tag, Save, Phone, X, Trash2,
  Image as ImageIcon, Paperclip, ExternalLink
} from "lucide-react";

export const Route = createFileRoute("/_app/messages")({
  component: Messages,
});

interface Msg {
  id: string;
  content: string | null;
  direction: "inbound" | "outbound";
  timestamp: string;
  recipient: string | null;
  status: string | null;
  error_message: string | null;
  keyword_matched: string | null;
  automation_id: string | null;
  media_url?: string | null;
}

interface LeadInfo {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  tags: string[] | null;
  status: "nuevo" | "interesado" | "cliente" | "perdido";
}

interface ContactInfo {
  id: string;
  name: string;
  phone: string;
  tags: string[] | null;
  notes: string | null;
}

interface Conversation {
  phone: string;
  displayName: string;
  lastMessage: string;
  lastTs: string;
  unread: number;
  inbound: boolean;
  tags: string[];
  status?: LeadInfo["status"];
}

const cleanPhone = (p: string | null | undefined) =>
  String(p ?? "").replace(/[^\d]/g, "");

const STATUS_COLORS: Record<LeadInfo["status"], string> = {
  nuevo: "bg-primary/15 text-primary",
  interesado: "bg-warning/15 text-warning",
  cliente: "bg-success/15 text-success",
  perdido: "bg-destructive/15 text-destructive",
};

function Messages() {
  const { organization, user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [leadsByPhone, setLeadsByPhone] = useState<Map<string, LeadInfo>>(new Map());
  const [contactsByPhone, setContactsByPhone] = useState<Map<string, ContactInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingTags, setEditingTags] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [hiddenWarnings, setHiddenWarnings] = useState<Set<string>>(new Set());
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load initial data: cache-first + delta sync from cloud
  useEffect(() => {
    if (!organization) return;
    const orgId = organization.id;
    setLoading(true);
    (async () => {
      const cached = await loadCachedMessages(orgId);
      if (cached.length) {
        const sorted = [...cached]
          .filter((m) => m.recipient)
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
        setMessages(sorted as Msg[]);
        setLoading(false);
      }

      const lastTs = await getLastCachedTimestamp(orgId);
      let query = supabase
        .from("messages_log")
        .select("id,org_id,content,direction,timestamp,recipient,status,error_message,keyword_matched,automation_id,media_url")
        .eq("org_id", orgId)
        .not("recipient", "is", null)
        .order("timestamp", { ascending: false })
        .limit(500);
      if (lastTs) query = query.gt("timestamp", lastTs);

      const [msgRes, leadsRes, contactsRes] = await Promise.all([
        query,
        supabase.from("leads").select("id,name,phone,email,notes,tags,status").eq("org_id", orgId),
        supabase.from("contacts").select("id,name,phone,notes,tags").eq("org_id", orgId),
      ]);

      const lmap = new Map<string, LeadInfo>();
      (leadsRes.data ?? []).forEach((l: any) => lmap.set(cleanPhone(l.phone), l as LeadInfo));
      const cmap = new Map<string, ContactInfo>();
      (contactsRes.data ?? []).forEach((c: any) => cmap.set(cleanPhone(c.phone), c as ContactInfo));
      setLeadsByPhone(lmap);
      setContactsByPhone(cmap);

      const fresh = (msgRes.data as CachedMsg[]) ?? [];
      if (fresh.length) {
        await saveCachedMessages(fresh);
        setMessages((prev) => {
          const map = new Map<string, Msg>();
          for (const m of prev) map.set(m.id, m);
          for (const m of fresh) map.set(m.id, m as unknown as Msg);
          return Array.from(map.values()).sort((a, b) =>
            a.timestamp < b.timestamp ? 1 : -1,
          );
        });
      } else if (!cached.length) {
        setMessages([]);
      }
      setLoading(false);
      pruneCacheOlderThanDays(orgId, 90);
    })();
  }, [organization]);

  // Realtime: new messages → state + cache
  useEffect(() => {
    if (!organization) return;
    const orgId = organization.id;
    const channel = supabase
      .channel(`chat:${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages_log", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const m = payload.new as Msg;
          if (!m.recipient) return;
          setMessages((prev) => [m, ...prev]);
          saveCachedMessages([{ ...(m as unknown as CachedMsg), org_id: orgId }]);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages_log", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
          saveCachedMessages([{ ...(m as unknown as CachedMsg), org_id: orgId }]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organization]);

  // Build conversation list
  const conversations: Conversation[] = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const m of messages) {
      const phone = cleanPhone(m.recipient);
      if (!phone) continue;
      const lead = leadsByPhone.get(phone);
      const contact = contactsByPhone.get(phone);
      const existing = map.get(phone);
      const previewText = m.content || (m.media_url ? "📷 [Imagen]" : "");
      if (existing) {
        if (new Date(m.timestamp) > new Date(existing.lastTs)) {
          existing.lastTs = m.timestamp;
          existing.lastMessage = previewText;
          existing.inbound = m.direction === "inbound";
        }
      } else {
        map.set(phone, {
          phone,
          displayName: lead?.name || contact?.name || `+${phone}`,
          lastMessage: previewText,
          lastTs: m.timestamp,
          unread: 0,
          inbound: m.direction === "inbound",
          tags: lead?.tags ?? contact?.tags ?? [],
          status: lead?.status,
        });
      }
    }
    const addEmpty = (phone: string, name: string, tags: string[], status?: LeadInfo["status"]) => {
      if (!phone || map.has(phone)) return;
      map.set(phone, {
        phone,
        displayName: name || `+${phone}`,
        lastMessage: "",
        lastTs: new Date(0).toISOString(),
        unread: 0,
        inbound: false,
        tags,
        status,
      });
    };
    leadsByPhone.forEach((l, p) => addEmpty(p, l.name, l.tags ?? [], l.status));
    contactsByPhone.forEach((c, p) => addEmpty(p, c.name, c.tags ?? []));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime(),
    );
  }, [messages, leadsByPhone, contactsByPhone]);

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.displayName.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [conversations, search]);

  useEffect(() => {
    if (!activePhone && filteredConvs.length > 0) setActivePhone(filteredConvs[0].phone);
  }, [filteredConvs, activePhone]);

  // Restore draft when activePhone changes
  useEffect(() => {
    if (!activePhone) return;
    try {
      const draft = localStorage.getItem(`leadflow_draft_msg_${activePhone}`);
      if (draft !== null) setComposer(draft);
    } catch { /* ignore */ }
  }, [activePhone]);

  const handleComposerChange = (val: string) => {
    setComposer(val);
    if (activePhone) {
      try {
        if (val) localStorage.setItem(`leadflow_draft_msg_${activePhone}`, val);
        else localStorage.removeItem(`leadflow_draft_msg_${activePhone}`);
      } catch { /* ignore */ }
    }
  };

  const thread = useMemo(() => {
    if (!activePhone) return [];
    return messages
      .filter((m) => cleanPhone(m.recipient) === activePhone)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, activePhone]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread.length, activePhone, imagePreview]);

  const activeLead = activePhone ? leadsByPhone.get(activePhone) : undefined;
  const activeContact = activePhone ? contactsByPhone.get(activePhone) : undefined;
  const activeName = activeLead?.name || activeContact?.name || (activePhone ? `+${activePhone}` : "");

  const lastInboundTs = useMemo(() => {
    const inbounds = thread.filter((m) => m.direction === "inbound");
    if (inbounds.length === 0) return null;
    return new Date(inbounds[inbounds.length - 1].timestamp).getTime();
  }, [thread]);
  const windowClosed =
    !!activePhone && (lastInboundTs === null || Date.now() - lastInboundTs > 24 * 60 * 60 * 1000);

  useEffect(() => {
    const tags = activeLead?.tags ?? activeContact?.tags ?? [];
    setEditingTags(tags.join(", "));
    setEditingNotes(activeLead?.notes ?? activeContact?.notes ?? "");
  }, [activePhone, activeLead?.id, activeContact?.id]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona un archivo de imagen válido");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen debe pesar menos de 5MB");
      return;
    }
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadSelectedImage = async (): Promise<string | null> => {
    if (!selectedImage || !organization) return null;
    setUploadingImage(true);
    try {
      const ext = selectedImage.name.split(".").pop() || "jpg";
      const filePath = `${organization.id}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const { data, error } = await supabase.storage.from("crm-media").upload(filePath, selectedImage, {
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      const { data: pubUrl } = supabase.storage.from("crm-media").getPublicUrl(data.path);
      return pubUrl.publicUrl;
    } catch (e: any) {
      console.error("[upload]", e);
      toast.error("Error al subir la imagen: " + (e?.message || ""));
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const sendMessage = async () => {
    if (!user || !activePhone || (!composer.trim() && !selectedImage)) return;
    const text = composer.trim();
    const phoneClean = cleanPhone(activePhone);
    setSending(true);

    let uploadedUrl: string | null = null;
    if (selectedImage) {
      uploadedUrl = await uploadSelectedImage();
      if (!uploadedUrl) {
        setSending(false);
        return;
      }
    }

    const optimisticId = `tmp_${Date.now()}`;
    const optimistic: Msg = {
      id: optimisticId,
      content: text || (uploadedUrl ? "📷 [Imagen]" : ""),
      direction: "outbound",
      timestamp: new Date().toISOString(),
      recipient: phoneClean,
      status: "pending",
      error_message: null,
      keyword_matched: null,
      automation_id: null,
      media_url: uploadedUrl,
    };
    setMessages((prev) => [optimistic, ...prev]);
    setComposer("");
    if (activePhone) {
      try { localStorage.removeItem(`leadflow_draft_msg_${activePhone}`); } catch { /* ignore */ }
    }
    clearImage();

    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-handler", {
        body: {
          user_id: user.id,
          numero: phoneClean,
          mensaje: text,
          media_url: uploadedUrl || undefined,
        },
      });
      if (error) throw new Error(error.message);
      const resp = data as any;
      if (resp && resp.ok === false) {
        throw new Error(resp.error || "Error al enviar");
      }
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? { ...m, status: "failed", error_message: e?.message || "Error" }
            : m,
        ),
      );
      toast.error(e?.message || "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  const saveDetails = async () => {
    if (!organization || !activePhone) return;
    setSavingDetails(true);
    const tags = editingTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      if (activeLead) {
        const { error } = await supabase
          .from("leads")
          .update({ notes: editingNotes, tags })
          .eq("id", activeLead.id);
        if (error) throw error;
        setLeadsByPhone((prev) => {
          const next = new Map(prev);
          next.set(activePhone, { ...activeLead, notes: editingNotes, tags });
          return next;
        });
      } else if (activeContact) {
        const { error } = await supabase
          .from("contacts")
          .update({ notes: editingNotes, tags })
          .eq("id", activeContact.id);
        if (error) throw error;
        setContactsByPhone((prev) => {
          const next = new Map(prev);
          next.set(activePhone, { ...activeContact, notes: editingNotes, tags });
          return next;
        });
      } else {
        const { data, error } = await supabase
          .from("leads")
          .insert({
            org_id: organization.id,
            name: activeName || `Lead +${activePhone}`,
            phone: activePhone,
            notes: editingNotes,
            tags,
            status: "nuevo",
          })
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setLeadsByPhone((prev) => {
            const next = new Map(prev);
            next.set(activePhone, data as LeadInfo);
            return next;
          });
        }
      }
      toast.success("Detalles guardados");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar");
    } finally {
      setSavingDetails(false);
    }
  };

  const updateStatus = async (newStatus: LeadInfo["status"]) => {
    if (!organization || !activePhone) return;
    try {
      if (activeLead) {
        const { error } = await supabase
          .from("leads")
          .update({ status: newStatus })
          .eq("id", activeLead.id);
        if (error) throw error;
        setLeadsByPhone((prev) => {
          const next = new Map(prev);
          next.set(activePhone, { ...activeLead, status: newStatus });
          return next;
        });
      } else {
        const { data, error } = await supabase
          .from("leads")
          .insert({
            org_id: organization.id,
            name: activeName || `Lead +${activePhone}`,
            phone: activePhone,
            status: newStatus,
          })
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setLeadsByPhone((prev) => {
            const next = new Map(prev);
            next.set(activePhone, data as LeadInfo);
            return next;
          });
        }
      }
      toast.success(`Estado actualizado a ${newStatus}`);
    } catch (e: any) {
      toast.error(e?.message || "Error al actualizar estado");
    }
  };

  const clearChat = async () => {
    if (!organization || !activePhone) return;
    const phoneClean = cleanPhone(activePhone);
    const confirmed = window.confirm(
      `¿Seguro que quieres borrar todos los mensajes con +${phoneClean}? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;
    try {
      const { error } = await supabase
        .from("messages_log")
        .delete()
        .eq("org_id", organization.id)
        .eq("recipient", phoneClean);
      if (error) throw error;
      deleteCachedMessagesByRecipient(organization.id, phoneClean);
      setMessages((prev) => prev.filter((m) => cleanPhone(m.recipient) !== phoneClean));
      toast.success("Conversación vaciada");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo vaciar el chat");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <BackToDashboard />
      <PageHeader
        title="Mensajes"
        description="Bandeja unificada de conversaciones de WhatsApp con soporte multimedia"
      />

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* COLUMN 1 — Conversation list */}
        <aside className="col-span-12 md:col-span-4 lg:col-span-3 glass rounded-2xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/40"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {loading && (
              <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando mensajes...
              </div>
            )}
            {!loading && filteredConvs.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aún no hay conversaciones.
              </div>
            )}
            {filteredConvs.map((c) => {
              const active = c.phone === activePhone;
              return (
                <button
                  key={c.phone}
                  onClick={() => setActivePhone(c.phone)}
                  className={`w-full text-left p-3 flex gap-3 items-start transition hover:bg-secondary/30 ${
                    active ? "bg-primary/10 border-l-2 border-primary" : ""
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold">
                    {(c.displayName[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{c.displayName}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(c.lastTs).toLocaleTimeString("es", {
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {c.inbound ? "" : "Tú: "}
                      {c.lastMessage || "—"}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {c.status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[c.status]}`}>
                          {c.status}
                        </span>
                      )}
                      {c.tags.slice(0, 2).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* COLUMN 2 — Chat window */}
        <section className="col-span-12 md:col-span-8 lg:col-span-6 glass rounded-2xl flex flex-col overflow-hidden">
          {!activePhone ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Selecciona una conversación para empezar.
            </div>
          ) : (
            <>
              <header className="p-4 border-b border-border flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 flex items-center justify-center text-sm font-semibold">
                  {(activeName[0] || "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{activeName}</div>
                  <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                    <Phone className="w-3 h-3" /> +{activePhone}
                  </div>
                </div>
                {activeLead?.status && (
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[activeLead.status]}`}>
                    {activeLead.status}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void clearChat()}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Vaciar chat (borra todos los mensajes de esta conversación)"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1.5 text-xs">Vaciar chat</span>
                </Button>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/20">
                {thread.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    Sin mensajes todavía. Escribe algo o envía una imagen para iniciar.
                  </div>
                )}
                {thread.map((m) => {
                  const isOut = m.direction === "outbound";
                  const imageUrl = m.media_url || (m.content?.startsWith("http") && (m.content.endsWith(".jpg") || m.content.endsWith(".png") || m.content.endsWith(".webp")) ? m.content : null);

                  return (
                    <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl p-3 text-sm shadow-sm space-y-2 ${
                          isOut
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-secondary text-foreground rounded-bl-sm"
                        }`}
                      >
                        {imageUrl && (
                          <div className="rounded-xl overflow-hidden cursor-pointer relative group" onClick={() => setViewingImage(imageUrl)}>
                            <img
                              src={imageUrl}
                              alt="Adjunto de WhatsApp"
                              className="max-h-60 w-full object-cover rounded-xl transition group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                        )}
                        {m.content && m.content !== "📷 [Imagen]" && (
                          <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        )}
                        <div className={`text-[10px] mt-1 flex items-center gap-1 justify-end ${
                          isOut ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}>
                          <span>
                            {new Date(m.timestamp).toLocaleTimeString("es", {
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                          {isOut && (
                            m.status === "sent" ? (
                              <CheckCheck className="w-3 h-3" />
                            ) : m.status === "failed" || m.status === "blocked" ? (
                              <AlertCircle className="w-3 h-3 text-destructive" />
                            ) : m.status === "pending" ? (
                              <Clock className="w-3 h-3" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )
                          )}
                          {m.keyword_matched && (
                            <span className="ml-1 px-1 py-0.5 rounded bg-background/30 text-[9px]">
                              #{m.keyword_matched}
                            </span>
                          )}
                        </div>
                        {m.status === "failed" && m.error_message && (
                          <div className="text-[10px] text-destructive mt-1">{m.error_message}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {windowClosed && activePhone && !hiddenWarnings.has(activePhone) && (
                <div className="mx-3 mt-2 mb-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning flex items-start gap-2 relative">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="pr-6">
                    Ventana de 24h cerrada. No puedes enviar texto plano: usa una <strong>Plantilla aprobada de Meta</strong> o espera a que el cliente te escriba.
                  </span>
                  <button
                    type="button"
                    aria-label="Ocultar aviso"
                    onClick={() =>
                      setHiddenWarnings((prev) => {
                        const next = new Set(prev);
                        next.add(activePhone);
                        return next;
                      })
                    }
                    className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-warning/20 text-warning/80 hover:text-warning transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Media Preview before send */}
              {imagePreview && (
                <div className="p-3 bg-secondary/30 border-t border-border flex items-center gap-3">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-border shrink-0">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={clearImage}
                      className="absolute top-1 right-1 p-0.5 bg-black/60 text-white rounded-full hover:bg-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{selectedImage?.name}</p>
                    <p>{((selectedImage?.size || 0) / 1024).toFixed(1)} KB · Se enviará con tu mensaje</p>
                  </div>
                </div>
              )}

              <div className="p-3 border-t border-border bg-background/30">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  className="hidden"
                />
                <div className="flex gap-2 items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-11 w-11 shrink-0 text-muted-foreground hover:text-primary"
                    title="Adjuntar imagen"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </Button>
                  <Textarea
                    value={composer}
                    onChange={(e) => handleComposerChange(e.target.value)}
                    placeholder={selectedImage ? "Agrega un pie de foto (opcional)..." : "Escribe un mensaje..."}
                    rows={1}
                    className="resize-none min-h-[44px] max-h-32 bg-background/50"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    disabled={sending || uploadingImage}
                  />
                  <Button
                    onClick={() => void sendMessage()}
                    disabled={sending || uploadingImage || (!composer.trim() && !selectedImage)}
                    className="gradient-brand text-background border-0 h-11 shrink-0 px-4"
                  >
                    {sending || uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* COLUMN 3 — Lead details */}
        <aside className="hidden lg:flex col-span-3 glass rounded-2xl flex-col overflow-hidden">
          {!activePhone ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-4 text-center">
              Selecciona un chat para ver detalles.
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-border text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary/40 to-primary/10 flex items-center justify-center text-xl font-semibold mb-2">
                  {(activeName[0] || "?").toUpperCase()}
                </div>
                <div className="font-semibold">{activeName}</div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">+{activePhone}</div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Etapa del embudo
                  </Label>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {(["nuevo", "interesado", "cliente", "perdido"] as const).map((st) => {
                      const active = (activeLead?.status || "nuevo") === st;
                      return (
                        <button
                          key={st}
                          onClick={() => void updateStatus(st)}
                          className={`text-xs py-1.5 px-2 rounded-lg border capitalize font-medium transition ${
                            active
                              ? `${STATUS_COLORS[st]} border-current`
                              : "border-border text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label htmlFor="tags" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Etiquetas (separadas por coma)
                  </Label>
                  <Input
                    id="tags"
                    value={editingTags}
                    onChange={(e) => setEditingTags(e.target.value)}
                    placeholder="VIP, Curso, Interesado"
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="notes" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Notas del lead
                  </Label>
                  <Textarea
                    id="notes"
                    value={editingNotes}
                    onChange={(e) => setEditingNotes(e.target.value)}
                    placeholder="Escribe notas internas sobre este cliente..."
                    rows={4}
                    className="mt-1 text-xs resize-none"
                  />
                </div>

                <Button
                  onClick={() => void saveDetails()}
                  disabled={savingDetails}
                  className="w-full gradient-brand text-background border-0"
                  size="sm"
                >
                  {savingDetails ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar detalles
                </Button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Modal Image Viewer */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={viewingImage} alt="Full view" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
            <button
              onClick={() => setViewingImage(null)}
              className="absolute -top-3 -right-3 p-2 bg-background border border-border rounded-full text-foreground hover:bg-secondary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
