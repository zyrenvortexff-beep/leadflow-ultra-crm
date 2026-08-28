// Envío de mensajes via Meta WhatsApp Cloud API (Texto e Imágenes).
// POST { user_id, numero, mensaje, media_url }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const META_GRAPH_VERSION = "v20.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

function normalizePhone(p: string) {
  let n = String(p || "").replace(/\D/g, "");
  if (n.length === 8 && /^[3789]/.test(n)) n = `504${n}`;
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: { user_id?: string; numero?: string; mensaje?: string; media_url?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const userId = body.user_id?.trim();
  const numero = normalizePhone(body.numero || "");
  const mensaje = (body.mensaje || "").trim();
  const mediaUrl = (body.media_url || "").trim();

  if (!userId || !numero || (!mensaje && !mediaUrl)) {
    return json({ ok: false, error: "missing_params: user_id, numero y mensaje o media_url requeridos" }, 400);
  }
  if (numero.length < 8) {
    return json({ ok: false, error: `numero_invalido: '${body.numero}' → '${numero}'` }, 400);
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prof?.org_id) return json({ ok: false, error: "user_no_tiene_organizacion" }, 400);
  const orgId = prof.org_id;

  const { data: cfg } = await admin
    .from("whatsapp_meta_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .maybeSingle();

  const phoneNumberId = String(cfg?.phone_number_id || "").trim();
  const accessToken = String(cfg?.access_token || "").trim().replace(/^Bearer\s+/i, "");

  if (!phoneNumberId || !accessToken) {
    return json({ ok: false, error: "meta_config_incompleto: configura Phone Number ID y Access Token" }, 200);
  }

  const { data: usageNew } = await admin.rpc("increment_daily_usage", { _org_id: orgId });
  if (usageNew === null) {
    await admin.from("messages_log").insert({
      org_id: orgId, direction: "outbound", content: mensaje || "[imagen]", media_url: mediaUrl || null,
      recipient: numero, status: "blocked", error_message: "Daily plan limit reached",
    });
    return json({ ok: false, error: "limite_diario_alcanzado" }, 200);
  }

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  
  const metaPayload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: numero,
  };

  if (mediaUrl) {
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

  if (!res.ok) {
    const errPayload = data?.error || {};
    const errMsg = `meta_${res.status}: ${JSON.stringify(data).slice(0, 400)}`;
    await admin.from("messages_log").insert({
      org_id: orgId, direction: "outbound", content: mensaje || "[imagen]", media_url: mediaUrl || null,
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
    return json({ ok: false, error: errMsg, raw: data }, 200);
  }

  const messageId = data?.messages?.[0]?.id || null;
  await admin.from("messages_log").insert({
    org_id: orgId, direction: "outbound", content: mensaje || "[imagen]", media_url: mediaUrl || null,
    recipient: numero, status: "sent", provider_message_id: messageId,
  });
  return json({ ok: true, numero, messageId, raw: data });
});
