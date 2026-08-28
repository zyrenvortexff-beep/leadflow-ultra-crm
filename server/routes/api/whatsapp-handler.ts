import { defineEventHandler, readBody, setResponseHeader } from "h3";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mhzwjoelcjkhhosjutun.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_SERVICE_ROLE_KEY";
const META_GRAPH_VERSION = "v20.0";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizePhone(p: string) {
  let n = String(p || "").replace(/\D/g, "");
  if (n.length === 8 && /^[3789]/.test(n)) n = `504${n}`;
  return n;
}

function isAudio(url: string, type?: string) {
  if (type === "audio" || type === "voice") return true;
  const clean = (url || "").toLowerCase().split("?")[0];
  return clean.endsWith(".mp3") || clean.endsWith(".ogg") || clean.endsWith(".wav") || clean.endsWith(".m4a") || clean.endsWith(".aac") || clean.endsWith(".opus") || clean.endsWith(".webm");
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Access-Control-Allow-Origin", "*");
  setResponseHeader(event, "Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  setResponseHeader(event, "Access-Control-Allow-Methods", "POST, OPTIONS");

  if (event.method === "OPTIONS") return null;
  if (event.method !== "POST") return { ok: false, error: "method_not_allowed" };

  let body: { user_id?: string; numero?: string; mensaje?: string; media_url?: string; media_type?: string } = {};
  try {
    body = await readBody(event);
  } catch {
    body = {};
  }

  const userId = body.user_id?.trim();
  const numero = normalizePhone(body.numero || "");
  const mensaje = (body.mensaje || "").trim();
  const mediaUrl = (body.media_url || "").trim();
  const mediaType = body.media_type || (isAudio(mediaUrl) ? "audio" : mediaUrl ? "image" : undefined);

  if (!userId || !numero || (!mensaje && !mediaUrl)) {
    return { ok: false, error: "missing_params: user_id, numero y mensaje o media_url requeridos" };
  }
  if (numero.length < 8) {
    return { ok: false, error: `numero_invalido: '${body.numero}' → '${numero}'` };
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prof?.org_id) return { ok: false, error: "user_no_tiene_organizacion" };
  const orgId = prof.org_id;

  const { data: cfg } = await admin
    .from("whatsapp_meta_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .maybeSingle();

  const phoneNumberId = String(cfg?.phone_number_id || "").trim();
  const accessToken = String(cfg?.access_token || "").trim().replace(/^Bearer\s+/i, "");

  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: "meta_config_incompleto: configura Phone Number ID y Access Token en WhatsApp Hub" };
  }

  const { data: usageNew } = await admin.rpc("increment_daily_usage", { _org_id: orgId });
  if (usageNew === null) {
    await admin.from("messages_log").insert({
      org_id: orgId, direction: "outbound", content: mensaje || (mediaType === "audio" ? "[audio]" : "[imagen]"), media_url: mediaUrl || null,
      recipient: numero, status: "blocked", error_message: "Daily plan limit reached",
    });
    return { ok: false, error: "limite_diario_alcanzado" };
  }

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  
  const metaPayload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: numero,
  };

  if (mediaType === "audio" || isAudio(mediaUrl, mediaType)) {
    metaPayload.type = "audio";
    metaPayload.audio = {
      link: mediaUrl,
    };
  } else if (mediaUrl) {
    metaPayload.type = "image";
    metaPayload.image = {
      link: mediaUrl,
      caption: mensaje || undefined,
    };
  } else {
    metaPayload.type = "text";
    metaPayload.text = { body: mensaje };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metaPayload),
  });

  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }

  const defaultContent = mediaType === "audio" ? "[audio]" : mediaUrl ? "[imagen]" : mensaje;

  if (!res.ok) {
    const errPayload = data?.error || {};
    const errMsg = `meta_${res.status}: ${JSON.stringify(data).slice(0, 400)}`;
    await admin.from("messages_log").insert({
      org_id: orgId, direction: "outbound", content: defaultContent, media_url: mediaUrl || null,
      recipient: numero, status: "failed", error_message: errMsg,
    });
    await admin.from("meta_errors").insert({
      org_id: orgId,
      recipient: numero,
      error_code: String(errPayload.code ?? res.status),
      error_title: errPayload.message || errPayload.title || "Error de Meta",
      error_detail: errPayload.error_data?.details || errPayload.error_user_msg || null,
      message_content: mensaje || mediaUrl,
      raw: data,
    });
    return { ok: false, error: errMsg, raw: data };
  }

  const messageId = data?.messages?.[0]?.id || null;
  await admin.from("messages_log").insert({
    org_id: orgId, direction: "outbound", content: defaultContent, media_url: mediaUrl || null,
    recipient: numero, status: "sent", provider_message_id: messageId,
  });
  return { ok: true, numero, messageId, raw: data };
});
