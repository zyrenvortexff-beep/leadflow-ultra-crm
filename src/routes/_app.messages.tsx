import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackToDashboard, PageHeader } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Send,
  Check,
  CheckCheck,
  Clock,
  Phone,
  Tag,
  AlertCircle,
  X,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Mic,
  Square,
  Play,
  Pause,
  Music,
  Volume2
} from "lucide-react";
import { toast } from "sonner";
import { invokeFunction } from "@/lib/functions";
import {
  loadCachedMessages,
  saveCachedMessages,
  getLastCachedTimestamp,
  pruneCacheOlderThanDays,
  type CachedMsg,
} from "@/lib/messages-cache";

export const Route = createFileRoute("/_app/messages")({
  component: MessagesPage,
});

type Msg = {
  id: string;
  org_id: string;
  content: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  recipient: string;
  status?: "sent" | "delivered" | "read" | "failed" | "pending" | "received" | "blocked";
  error_message?: string | null;
  keyword_matched?: string | null;
  automation_id?: string | null;
  media_url?: string | null;
};

type LeadInfo = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  status?: string | null;
};

type ContactInfo = {
  id: string;
  name: string;
  phone: string;
  notes?: string | null;
  tags?: string[] | null;
};

const STATUS_COLORS: Record<string, string> = {
  nuevo: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  interesado: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  cliente: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  perdido: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

const cleanPhone = (value: unknown) => String(value || "").replace(/\D/g, "");

function isAudioUrl(url?: string | null, content?: string | null): boolean {
  if (!url && !content) return false;
  const target = (url || content || "").toLowerCase().split("?")[0];
  return (
    target.endsWith(".ogg") ||
    target.endsWith(".mp3") ||
    target.endsWith(".m4a") ||
    target.endsWith(".wav") ||
    target.endsWith(".aac") ||
    target.endsWith(".opus") ||
    target.endsWith(".webm") ||
    content === "[audio]" ||
    content === "🎤 Nota de voz"
  );
}

function AudioMessage({ src, isOut }: { src: string; isOut: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="flex items-center gap-2.5 py-1.5 px-3 bg-background/20 rounded-xl min-w-[240px] max-w-full">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />
      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-md transition-transform active:scale-95 ${
          isOut
            ? "bg-white text-primary hover:bg-white/90"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
      >
        {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
      </button>

      <div className="flex-1 min-w-0">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={(e) => {
            const val = Number(e.target.value);
            setCurrentTime(val);
            if (audioRef.current) audioRef.current.currentTime = val;
          }}
          className="w-full h-1.5 accent-emerald-500 bg-background/40 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[10px] opacity-80 mt-0.5 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span className="flex items-center gap-1">
            <Volume2 className="w-2.5 h-2.5" />
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

function MessagesPage() {
  const { user, organization } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [leadsByPhone, setLeadsByPhone] = useState<Map<string, LeadInfo>>(new Map());
  const [contactsByPhone, setContactsByPhone] = useState<Map<string, ContactInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [hiddenWarnings, setHiddenWarnings] = useState<Set<string>>(new Set());

  // Editables
  const [editingTags, setEditingTags] = useState("");
  const [editingNotes, setEditingNotes] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  // Multimedia (Fotos)
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // Grabador de Voz / Audio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Carga inicial
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

  // Realtime subscription
  useEffect(() => {
    if (!organization) return;
    const orgId = organization.id;

    const channel = supabase
      .channel(`messages_log:org:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages_log",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const raw = payload.new as Msg;
            if (!raw.recipient) return;
            setMessages((prev) => {
              const map = new Map<string, Msg>();
              for (const m of prev) map.set(m.id, m);
              map.set(raw.id, raw);
              const next = Array.from(map.values()).sort((a, b) =>
                a.timestamp < b.timestamp ? 1 : -1,
              );
              saveCachedMessages([raw as CachedMsg]);
              return next;
            });
          } else if (payload.eventType === "UPDATE") {
            const raw = payload.new as Msg;
            setMessages((prev) =>
              prev.map((m) => (m.id === raw.id ? { ...m, ...raw } : m)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization]);

  // Agrupación de conversaciones
  const conversations = useMemo(() => {
    const map = new Map<
      string,
      { phone: string; lastMsg: Msg; unreadCount: number; lead?: LeadInfo; contact?: ContactInfo }
    >();

    for (const m of messages) {
      const p = cleanPhone(m.recipient);
      if (!p) continue;
      const existing = map.get(p);
      if (!existing) {
        map.set(p, {
          phone: p,
          lastMsg: m,
          unreadCount: m.direction === "inbound" && m.status !== "read" ? 1 : 0,
          lead: leadsByPhone.get(p),
          contact: contactsByPhone.get(p),
        });
      } else {
        if (new Date(m.timestamp) > new Date(existing.lastMsg.timestamp)) {
          existing.lastMsg = m;
        }
        if (m.direction === "inbound" && m.status !== "read") {
          existing.unreadCount += 1;
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.lastMsg.timestamp).getTime() - new Date(a.lastMsg.timestamp).getTime(),
    );
  }, [messages, leadsByPhone, contactsByPhone]);

  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const name = c.lead?.name || c.contact?.name || "";
      return name.toLowerCase().includes(q) || c.phone.includes(q) || c.lastMsg.content.toLowerCase().includes(q);
    });
  }, [conversations, search]);

  useEffect(() => {
    if (!activePhone && filteredConvs.length > 0) {
      setActivePhone(filteredConvs[0].phone);
    }
  }, [filteredConvs, activePhone]);

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
  }, [thread.length, activePhone, imagePreview, audioPreviewUrl]);

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

  // Selección de Imagen
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

  // Selección de Archivo de Audio
  const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization) return;
    if (!file.type.startsWith("audio/") && !file.name.endsWith(".ogg") && !file.name.endsWith(".mp3") && !file.name.endsWith(".m4a")) {
      toast.error("Por favor selecciona un archivo de audio válido");
      return;
    }
    setAudioBlob(file);
    setAudioPreviewUrl(URL.createObjectURL(file));
  };

  const clearAudio = () => {
    setAudioBlob(null);
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    if (audioFileInputRef.current) audioFileInputRef.current.value = "";
  };

  // Grabador de Micrófono
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let mimeType = "audio/ogg; codecs=opus";
      if (MediaRecorder.isTypeSupported("audio/ogg; codecs=opus")) {
        mimeType = "audio/ogg; codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/aac")) {
        mimeType = "audio/aac";
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/ogg";
      } else {
        mimeType = "audio/ogg";
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Garantizar que el blob se cree con un tipo MIME aceptado por Meta (audio/ogg u audio/mp4)
        const finalMime = mimeType.includes("mp4") ? "audio/mp4" : "audio/ogg; codecs=opus";
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        setAudioBlob(blob);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (e: any) {
      toast.error("No se pudo acceder al micrófono: " + (e?.message || ""));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      clearAudio();
    }
  };

  const uploadMediaBlob = async (blob: Blob, ext = "jpg", mime = "image/jpeg"): Promise<string | null> => {
    if (!organization) return null;
    try {
      const filePath = `${organization.id}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const { data, error } = await supabase.storage.from("crm-media").upload(filePath, blob, {
        contentType: mime,
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      const { data: pubUrl } = supabase.storage.from("crm-media").getPublicUrl(data.path);
      return pubUrl.publicUrl;
    } catch (e: any) {
      console.error("[uploadMediaBlob]", e);
      toast.error("Error al subir archivo: " + (e?.message || ""));
      return null;
    }
  };

  const sendMessage = async () => {
    if (!user || !activePhone || (!composer.trim() && !selectedImage && !audioBlob)) return;
    const text = composer.trim();
    const phoneClean = cleanPhone(activePhone);
    setSending(true);

    let mediaUrlToSend: string | null = null;
    let mediaTypeToSend: "image" | "audio" | undefined = undefined;

    if (selectedImage) {
      const ext = selectedImage.name.split(".").pop() || "jpg";
      mediaUrlToSend = await uploadMediaBlob(selectedImage, ext, selectedImage.type || "image/jpeg");
      mediaTypeToSend = "image";
      if (!mediaUrlToSend) {
        setSending(false);
        return;
      }
    } else if (audioBlob) {
      setUploadingAudio(true);
      const isMp4 = audioBlob.type.includes("mp4") || audioBlob.type.includes("aac");
      const ext = isMp4 ? "mp4" : "ogg";
      const mime = isMp4 ? "audio/mp4" : "audio/ogg; codecs=opus";
      mediaUrlToSend = await uploadMediaBlob(audioBlob, ext, mime);
      mediaTypeToSend = "audio";
      setUploadingAudio(false);
      if (!mediaUrlToSend) {
        setSending(false);
        return;
      }
    }

    const optimisticMsg: Msg = {
      id: `opt_${Date.now()}`,
      org_id: organization?.id || "",
      content: text || (mediaTypeToSend === "audio" ? "[audio]" : "[imagen]"),
      media_url: mediaUrlToSend,
      direction: "outbound",
      timestamp: new Date().toISOString(),
      recipient: phoneClean,
      status: "pending",
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setComposer("");
    clearImage();
    clearAudio();
    if (activePhone) localStorage.removeItem(`leadflow_draft_msg_${activePhone}`);

    try {
      const res = await invokeFunction("whatsapp-handler", {
        user_id: user.id,
        numero: phoneClean,
        mensaje: text,
        media_url: mediaUrlToSend,
        media_type: mediaTypeToSend,
      });

      if (res.error) {
        toast.error(`Error al enviar: ${res.error.message || res.error}`);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticMsg.id
              ? { ...m, status: "failed", error_message: res.error.message || String(res.error) }
              : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticMsg.id ? { ...m, status: "sent" } : m)),
        );
      }
    } catch (err: any) {
      toast.error(`Error de red: ${err?.message || "desconocido"}`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMsg.id
            ? { ...m, status: "failed", error_message: err?.message || "network_error" }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const updateLeadStatus = async (status: string) => {
    if (!activeLead) return;
    try {
      await supabase.from("leads").update({ status, updated_at: new Date().toISOString() }).eq("id", activeLead.id);
      setLeadsByPhone((prev) => {
        const next = new Map(prev);
        const cur = next.get(activePhone!);
        if (cur) next.set(activePhone!, { ...cur, status });
        return next;
      });
      toast.success("Estado actualizado");
    } catch (err: any) {
      toast.error("Error al actualizar estado: " + err?.message);
    }
  };

  const saveDetails = async () => {
    if (!activePhone) return;
    setSavingDetails(true);
    const tagsArr = editingTags.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    try {
      if (activeLead) {
        await supabase.from("leads").update({ tags: tagsArr, notes: editingNotes, updated_at: new Date().toISOString() }).eq("id", activeLead.id);
        setLeadsByPhone((prev) => {
          const next = new Map(prev);
          const cur = next.get(activePhone);
          if (cur) next.set(activePhone, { ...cur, tags: tagsArr, notes: editingNotes });
          return next;
        });
      }
      if (activeContact) {
        await supabase.from("contacts").update({ tags: tagsArr, notes: editingNotes, updated_at: new Date().toISOString() }).eq("id", activeContact.id);
        setContactsByPhone((prev) => {
          const next = new Map(prev);
          const cur = next.get(activePhone);
          if (cur) next.set(activePhone, { ...cur, tags: tagsArr, notes: editingNotes });
          return next;
        });
      }
      toast.success("Detalles guardados");
    } catch (err: any) {
      toast.error("Error: " + err?.message);
    } finally {
      setSavingDetails(false);
    }
  };

  const clearChat = async () => {
    if (!activePhone || !organization) return;
    if (!confirm(`¿Vaciar toda la conversación con ${activeName}?`)) return;
    try {
      const { error } = await supabase
        .from("messages_log")
        .delete()
        .eq("org_id", organization.id)
        .eq("recipient", activePhone);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => cleanPhone(m.recipient) !== activePhone));
      toast.success("Conversación vaciada");
    } catch (e: any) {
      toast.error("Error al vaciar chat: " + (e?.message || ""));
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col space-y-4 max-w-[1800px] mx-auto p-4 md:p-6">
      <BackToDashboard />
      <PageHeader
        title="Mensajería en Tiempo Real"
        subtitle="Chatea directamente con tus clientes por WhatsApp con soporte de texto, imágenes y notas de voz"
      />

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* COLUMN 1 — Conversaciones */}
        <aside className="col-span-12 md:col-span-4 lg:col-span-3 glass rounded-2xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente o mensaje..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-background/50 text-sm"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {loading && (
              <div className="p-4 text-center text-xs text-muted-foreground">Cargando chats...</div>
            )}
            {!loading && filteredConvs.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground">No hay mensajes aún</div>
            )}
            {filteredConvs.map((c) => {
              const name = c.lead?.name || c.contact?.name || `+${c.phone}`;
              const active = c.phone === activePhone;
              const isAudio = isAudioUrl(c.lastMsg.media_url, c.lastMsg.content);

              return (
                <button
                  key={c.phone}
                  onClick={() => setActivePhone(c.phone)}
                  className={`w-full text-left p-3.5 flex gap-3 transition-colors hover:bg-secondary/50 ${
                    active ? "bg-primary/10 border-l-2 border-primary" : ""
                  }`}
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-sm font-semibold shrink-0">
                    {(name[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-semibold text-sm truncate">{name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {new Date(c.lastMsg.timestamp).toLocaleTimeString("es", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      {isAudio ? (
                        <>
                          <Mic className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>Nota de voz</span>
                        </>
                      ) : c.lastMsg.media_url ? (
                        <>
                          <ImageIcon className="w-3 h-3 text-primary shrink-0" />
                          <span>Foto</span>
                        </>
                      ) : (
                        c.lastMsg.content
                      )}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* COLUMN 2 — Ventana de Chat */}
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
                  title="Vaciar chat"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/20">
                {thread.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    Sin mensajes todavía. Escribe algo o envía una nota de voz para iniciar.
                  </div>
                )}
                {thread.map((m) => {
                  const isOut = m.direction === "outbound";
                  const isAudio = isAudioUrl(m.media_url, m.content);
                  const imageUrl = !isAudio ? (m.media_url || (m.content?.startsWith("http") && (m.content.endsWith(".jpg") || m.content.endsWith(".png") || m.content.endsWith(".webp")) ? m.content : null)) : null;

                  return (
                    <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] sm:max-w-[70%] rounded-2xl p-3 text-sm shadow-sm space-y-1.5 ${
                          isOut
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-secondary text-foreground rounded-bl-sm"
                        }`}
                      >
                        {/* Audio / Nota de voz */}
                        {isAudio && m.media_url && (
                          <AudioMessage src={m.media_url} isOut={isOut} />
                        )}

                        {/* Imagen */}
                        {imageUrl && (
                          <div className="rounded-xl overflow-hidden cursor-pointer relative group" onClick={() => setViewingImage(imageUrl)}>
                            <img
                              src={imageUrl}
                              alt="Adjunto"
                              className="max-h-60 w-full object-cover rounded-xl transition group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                        )}

                        {/* Texto */}
                        {m.content && m.content !== "📷 [Imagen]" && m.content !== "[audio]" && m.content !== "[imagen]" && (
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
                    Ventana de 24h cerrada. Para iniciar contacto debes usar una plantilla o esperar que el cliente responda.
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setHiddenWarnings((prev) => {
                        const next = new Set(prev);
                        next.add(activePhone);
                        return next;
                      })
                    }
                    className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-warning/20"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Previsualización de Imagen */}
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
                    <p>{((selectedImage?.size || 0) / 1024).toFixed(1)} KB · Listo para enviar</p>
                  </div>
                </div>
              )}

              {/* Previsualización de Audio grabado o seleccionado */}
              {audioPreviewUrl && (
                <div className="p-3 bg-secondary/30 border-t border-border flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <AudioMessage src={audioPreviewUrl} isOut={false} />
                    <span className="text-xs text-emerald-500 font-medium whitespace-nowrap">Nota de voz lista</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={clearAudio} className="h-8 w-8 text-destructive">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* BARRA DE ENTRADA Y GRABACIÓN */}
              <div className="p-3 border-t border-border bg-background/30">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  className="hidden"
                />
                <input
                  type="file"
                  ref={audioFileInputRef}
                  onChange={handleAudioFileSelect}
                  accept="audio/*,.ogg,.mp3,.m4a,.wav"
                  className="hidden"
                />

                {isRecording ? (
                  /* Modo Grabación de Voz en Vivo */
                  <div className="flex items-center justify-between gap-3 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-xl animate-pulse">
                    <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                      <div className="w-3 h-3 rounded-full bg-destructive animate-ping" />
                      <span>Grabando audio: {Math.floor(recordingSeconds / 60)}:{recordingSeconds % 60 < 10 ? "0" : ""}{recordingSeconds % 60}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={cancelRecording}
                        className="text-muted-foreground hover:text-destructive h-8 px-2 text-xs"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={stopRecording}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 px-3 text-xs"
                      >
                        <Square className="w-3.5 h-3.5 mr-1 fill-current" />
                        Finalizar
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Modo Normal de Texto y Botones */
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

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => audioFileInputRef.current?.click()}
                      className="h-11 w-11 shrink-0 text-muted-foreground hover:text-emerald-500"
                      title="Subir archivo de audio"
                    >
                      <Music className="w-5 h-5" />
                    </Button>

                    <Textarea
                      value={composer}
                      onChange={(e) => handleComposerChange(e.target.value)}
                      placeholder={selectedImage ? "Pie de foto (opcional)..." : audioBlob ? "Audio listo para enviar..." : "Escribe un mensaje..."}
                      rows={1}
                      className="resize-none min-h-[44px] max-h-32 bg-background/50"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                      disabled={sending || uploadingImage || uploadingAudio}
                    />

                    {/* Botón de Grabar Micrófono si no hay texto escrito */}
                    {!composer.trim() && !selectedImage && !audioBlob ? (
                      <Button
                        type="button"
                        onClick={startRecording}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 w-11 shrink-0 p-0 rounded-xl shadow-md"
                        title="Grabar nota de voz"
                      >
                        <Mic className="w-5 h-5" />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => void sendMessage()}
                        disabled={sending || uploadingImage || uploadingAudio}
                        className="gradient-brand text-background border-0 h-11 shrink-0 px-4"
                      >
                        {sending || uploadingImage || uploadingAudio ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* COLUMN 3 — Detalles del Contacto / Lead */}
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
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Etapa del embudo
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {(["nuevo", "interesado", "cliente", "perdido"] as const).map((st) => {
                      const active = (activeLead?.status || "nuevo") === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => updateLeadStatus(st)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
                            active
                              ? STATUS_COLORS[st]
                              : "border-border/40 text-muted-foreground hover:bg-secondary/40"
                          }`}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Etiquetas (separadas por coma)
                  </label>
                  <Input
                    value={editingTags}
                    onChange={(e) => setEditingTags(e.target.value)}
                    placeholder="VIP, PROMO, CLIENTE_NUEVO"
                    className="mt-1.5 h-8 text-xs bg-background/50"
                  />
                </div>

                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Notas del Asesor
                  </label>
                  <Textarea
                    rows={4}
                    value={editingNotes}
                    onChange={(e) => setEditingNotes(e.target.value)}
                    placeholder="Notas internas sobre este cliente..."
                    className="mt-1.5 text-xs bg-background/50 resize-none"
                  />
                </div>

                <Button
                  size="sm"
                  onClick={saveDetails}
                  disabled={savingDetails}
                  className="w-full text-xs"
                >
                  {savingDetails ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Guardar Detalles
                </Button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Modal para ver imagen en tamaño completo */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={viewingImage} alt="WhatsApp" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
            <button
              onClick={() => setViewingImage(null)}
              className="absolute -top-3 -right-3 p-2 bg-white text-black rounded-full shadow-lg hover:bg-white/80"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
