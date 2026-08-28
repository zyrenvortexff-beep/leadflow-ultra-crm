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
  phone: string;          // normalized digits-only
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load initial data: cache-first + delta sync from cloud
  useEffect(() => {
    if (!organization) return;
    const orgId = organization.id;
    setLoading(true);
    (async () => {
      // 1) Paint from local cache instantly
      const cached = await loadCachedMessages(orgId);
      if (cached.length) {
        const sorted = [...cached]
          .filter((m) => m.recipient)
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
        setMessages(sorted as Msg[]);
        setLoading(false);
      }

      // 2) Delta sync: only fetch rows newer than the latest cached one
      const lastTs = await getLastCachedTimestamp(orgId);
      let query = supabase
        .from("messages_log")
        .select("id,org_id,content,direction,timestamp,recipient,status,error_message,keyword_matched,automation_id")
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

      // Keep local cache lean (90 days max in the browser)
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


  // Build conversation list (one per phone, sorted by last activity)
  const conversations: Conversation[] = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const m of messages) {
      const phone = cleanPhone(m.recipient);
      if (!phone) continue;
      const lead = leadsByPhone.get(phone);
      const contact = contactsByPhone.get(phone);
      const existing = map.get(phone);
      if (existing) {
        if (new Date(m.timestamp) > new Date(existing.lastTs)) {
          existing.lastTs = m.timestamp;
          existing.lastMessage = m.content ?? "";
          existing.inbound = m.direction === "inbound";
        }
      } else {
        map.set(phone, {
          phone,
          displayName: lead?.name || contact?.name || `+${phone}`,
          lastMessage: m.content ?? "",
          lastTs: m.timestamp,
          unread: 0,
          inbound: m.direction === "inbound",
          tags: lead?.tags ?? contact?.tags ?? [],
          status: lead?.status,
        });
      }
    }
    // Include saved leads/contacts that don't have messages yet
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

  // Auto-select first conversation
  useEffect(() => {
    if (!activePhone && filteredConvs.length > 0) setActivePhone(filteredConvs[0].phone);
  }, [filteredConvs, activePhone]);

  // Active thread (oldest → newest)
  const thread = useMemo(() => {
    if (!activePhone) return [];
    return messages
      .filter((m) => cleanPhone(m.recipient) === activePhone)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, activePhone]);

  // Auto-scroll to bottom on new message in active thread
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread.length, activePhone]);

  // Active lead/contact details
  const activeLead = activePhone ? leadsByPhone.get(activePhone) : undefined;
  const activeContact = activePhone ? contactsByPhone.get(activePhone) : undefined;
  const activeName = activeLead?.name || activeContact?.name || (activePhone ? `+${activePhone}` : "");

  // 24h window status: last inbound message in this thread
  const lastInboundTs = useMemo(() => {
    const inbounds = thread.filter((m) => m.direction === "inbound");
    if (inbounds.length === 0) return null;
    return new Date(inbounds[inbounds.length - 1].timestamp).getTime();
  }, [thread]);
  const windowClosed =
    !!activePhone && (lastInboundTs === null || Date.now() - lastInboundTs > 24 * 60 * 60 * 1000);

  // Sync editing buffers when active changes
  useEffect(() => {
    const tags = activeLead?.tags ?? activeContact?.tags ?? [];
    setEditingTags(tags.join(", "));
    setEditingNotes(activeLead?.notes ?? activeContact?.notes ?? "");
  }, [activePhone, activeLead?.id, activeContact?.id]);

  const sendMessage = async () => {
    if (!user || !activePhone || !composer.trim()) return;
    const text = composer.trim();
    const phoneClean = cleanPhone(activePhone);
    setSending(true);
    // optimistic local message
    const optimisticId = `tmp_${Date.now()}`;
    const optimistic: Msg = {
      id: optimisticId,
      content: text,
      direction: "outbound",
      timestamp: new Date().toISOString(),
      recipient: phoneClean,
      status: "pending",
      error_message: null,
      keyword_matched: null,
      automation_id: null,
    };
    setMessages((prev) => [optimistic, ...prev]);
    setComposer("");
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-handler", {
        body: { user_id: user.id, numero: phoneClean, mensaje: text },
      });
      if (error) throw new Error(error.message);
      const resp = data as any;
      if (resp && resp.ok === false) {
        if (resp.disconnected) {
          throw new Error("WhatsApp desconectado, por favor escanea el QR de nuevo");
        }
        throw new Error(resp.error || "Error al enviar");
      }
      if (resp?.messageId) {
        console.log(`[messages] enviado ✔ messageId=${resp.messageId} to=${phoneClean}`);
      }
      // Realtime INSERT will replace; but drop optimistic right away to avoid dupes
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
        // Create a new lead so this contact is tracked
        const { data, error } = await supabase
          .from("leads")
          .insert({
            org_id: organization.id,
            name: `+${activePhone}`,
            phone: activePhone,
            notes: editingNotes,
            tags,
          })
          .select("id,name,phone,email,notes,tags,status")
          .maybeSingle();
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
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSavingDetails(false);
    }
  };

  const updateLeadStatus = async (status: LeadInfo["status"]) => {
    if (!activeLead) return;
    const prev = activeLead;
    setLeadsByPhone((m) => {
      const next = new Map(m);
      next.set(activeLead.phone ? cleanPhone(activeLead.phone) : activePhone!, { ...prev, status });
      return next;
    });
    const { error } = await supabase.from("leads").update({ status }).eq("id", activeLead.id);
    if (error) toast.error(error.message);
  };

  const clearChat = async () => {
    if (!organization || !activePhone) return;
    const orgId = organization.id;
    const phone = activePhone;
    const ok = window.confirm(
      `¿Vaciar el chat con +${phone}?\n\nSe eliminarán TODOS los mensajes de esta conversación, tanto de la nube como del navegador. Esta acción no se puede deshacer.\n\nEl contacto/lead y sus etiquetas se conservarán.`,
    );
    if (!ok) return;
    try {
      // 1) Borrar de la nube (RLS: org_id = get_user_org(auth.uid()))
      const { error } = await supabase
        .from("messages_log")
        .delete()
        .eq("org_id", orgId)
        .eq("recipient", phone);
      if (error) throw error;
      // 2) Borrar del cache local (IndexedDB)
      await deleteCachedMessagesByRecipient(orgId, phone);
      // 3) Borrar del estado en memoria
      setMessages((prev) => prev.filter((m) => cleanPhone(m.recipient) !== phone));
      toast.success("Chat vaciado");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo vaciar el chat");
    }
  };


  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <BackToDashboard />
      <PageHeader title="Mensajes" description="Chat en vivo con tus contactos vía WhatsApp" />

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[560px]">
        {/* COLUMN 1 — Conversations list */}
        <aside className="col-span-12 md:col-span-4 lg:col-span-3 glass rounded-2xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar conversación..."
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

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-background/20">
                {thread.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    Sin mensajes todavía. Escribe algo abajo para iniciar.
                  </div>
                )}
                {thread.map((m) => {
                  const isOut = m.direction === "outbound";
                  return (
                    <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
                          isOut
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-secondary text-foreground rounded-bl-sm"
                        }`}
                      >
                        <div>{m.content}</div>
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
                            <span className="ml-1 px-1 py-0.5 rounded bg-background/30">
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
              <div className="p-3 border-t border-border bg-background/30">
                <div className="flex gap-2 items-end">
                  <Textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    placeholder="Escribe un mensaje..."
                    rows={1}
                    className="resize-none min-h-[44px] max-h-32 bg-background/50"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    disabled={sending}
                  />
                  <Button
                    onClick={() => void sendMessage()}
                    disabled={sending || !composer.trim()}
                    className="gradient-brand text-background border-0 h-11"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
                <div className="text-xs text-muted-foreground font-mono">+{activePhone}</div>
                {activeLead?.email && (
                  <div className="text-xs text-muted-foreground mt-1">{activeLead.email}</div>
                )}
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  {activeLead ? (
                    <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">Lead</Badge>
                  ) : activeContact ? (
                    <Badge className="bg-accent/15 text-accent border-accent/30 text-[10px]">Contacto</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Sin registro</Badge>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                {activeLead && (
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Estado</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {(["nuevo", "interesado", "cliente", "perdido"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => void updateLeadStatus(s)}
                          className={`text-xs py-1.5 rounded-lg border transition ${
                            activeLead.status === s
                              ? `${STATUS_COLORS[s]} border-transparent font-semibold`
                              : "border-border hover:bg-secondary/40"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="tags" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Etiquetas
                  </Label>
                  <Input
                    id="tags"
                    placeholder="vip, interesado, demo"
                    value={editingTags}
                    onChange={(e) => setEditingTags(e.target.value)}
                    className="mt-1 bg-background/40"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Separa con comas</p>
                </div>

                <div>
                  <Label htmlFor="notes" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Notas
                  </Label>
                  <Textarea
                    id="notes"
                    rows={5}
                    placeholder="Notas internas sobre este contacto..."
                    value={editingNotes}
                    onChange={(e) => setEditingNotes(e.target.value)}
                    className="mt-1 bg-background/40"
                  />
                </div>

                <Button
                  onClick={() => void saveDetails()}
                  disabled={savingDetails}
                  className="w-full gradient-brand text-background border-0"
                >
                  {savingDetails ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Guardar cambios
                </Button>

                {!activeLead && !activeContact && (
                  <div className="text-xs text-muted-foreground text-center pt-2">
                    Al guardar se creará un Lead nuevo para este número.
                  </div>
                )}

                {(activeLead?.tags?.length || activeContact?.tags?.length) ? (
                  <div className="pt-2">
                    <div className="flex flex-wrap gap-1">
                      {(activeLead?.tags ?? activeContact?.tags ?? []).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">#{t}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
