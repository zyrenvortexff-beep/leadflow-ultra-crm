// WhatsApp webhook for Meta Cloud API — MULTI-TENANT con ENRUTAMIENTO INTELIGENTE.
// GET  → handshake (hub.verify_token / hub.challenge)
// POST → identifica la organización a partir de value.metadata.phone_number_id,
//        guarda mensajes entrantes en messages_log y dispara automatizaciones.
//
// Usa SUPABASE_SERVICE_ROLE_KEY → bypassa RLS (el webhook es una petición pública
// de Meta, no hay sesión de usuario).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const META_GRAPH_VERSION = "v20.0";
const DEFAULT_VERIFY_TOKEN = "LeadFlowoficial2026";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ok = (payload: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...payload }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const normalizeText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Devuelve la longitud del keyword que hizo match (0 si no hay match).
// Hace match por palabra COMPLETA (word boundary), no por substring,
// para evitar que "ia" dispare en "gracias", "dia", "familia", etc.
const keywordMatchScore = (incomingText: string, automationKeyword: string) => {
  const incoming = normalizeText(incomingText);
  if (!incoming) return 0;
  const padded = ` ${incoming} `;
  const keywords = String(automationKeyword || "")
    .split(/[,\n;|]+/)
    .map((k) => normalizeText(k))
    .filter(Boolean);
  let best = 0;
  for (const k of keywords) {
    // Frase con espacio → match de frase completa; palabra única → match exacto delimitado
    const needle = ` ${k} `;
    if (padded.includes(needle)) {
      if (k.length > best) best = k.length;
    }
  }
  return best;
};

const keywordMatches = (incomingText: string, automationKeyword: string) =>
  keywordMatchScore(incomingText, automationKeyword) > 0;

const firstKeyword = (value: unknown) =>
  String(value || "").split(/[,\n;|]+/)[0]?.trim() || "";

const cleanPhone = (value: unknown) => String(value || "").replace(/\D/g, "");

async function sendMetaText(opts: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}) {
  const phoneNumberId = String(opts.phoneNumberId || "").trim();
  const accessToken = String(opts.accessToken || "").trim().replace(/^Bearer\s+/i, "");
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: opts.to,
      type: "text",
      text: { body: opts.text },
    }),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // ADMIN client — bypassa RLS (necesario: Meta envía sin auth de usuario)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const url = new URL(req.url);
  const orgIdParam = url.searchParams.get("org_id");

  // === GET: handshake de verificación ===
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token) {
      let valid = token === DEFAULT_VERIFY_TOKEN;
      if (!valid && orgIdParam) {
        const { data } = await admin
          .from("whatsapp_meta_config")
          .select("verify_token")
          .eq("org_id", orgIdParam)
          .maybeSingle();
        valid = !!data && data.verify_token === token;
      }
      if (!valid) {
        const { data } = await admin
          .from("whatsapp_meta_config")
          .select("verify_token")
          .eq("verify_token", token)
          .limit(1)
          .maybeSingle();
        valid = !!data;
      }
      if (valid) {
        return new Response(challenge || "", {
          status: 200,
          headers: { "Content-Type": "text/plain", ...corsHeaders },
        });
      }
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
    return ok({ validation: true });
  }

  if (req.method !== "POST") return ok();

  // === Auditoría inmediata: registra TODO POST antes de cualquier procesamiento ===
  const rawBody = await req.text();
  console.log("[whatsapp-webhook] POST recibido. org_id_param=", orgIdParam, " bytes=", rawBody.length);
  try {
    await admin.from("webhook_logs").insert({
      event: "raw_post",
      org_id: orgIdParam || null,
      processing_result: `received:${rawBody.length}b`,
      raw_payload: rawBody
        ? (() => { try { return JSON.parse(rawBody); } catch { return { raw: rawBody.slice(0, 2000) }; } })()
        : null,
    });
  } catch (e) {
    console.error("[webhook_logs] raw_post insert failed:", (e as any)?.message);
  }

  let payload: any = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return ok({ note: "non_json_body" });
  }
  if (!payload) return ok({ validation: true });

  // Helper para registrar resultado final del procesamiento
  const logWebhook = async (params: {
    orgId: string | null;
    keyword?: string | null;
    tag?: string | null;
    result: string;
    from?: string | null;
    text?: string | null;
    extra?: Record<string, unknown>;
  }) => {
    try {
      await admin.from("webhook_logs").insert({
        event: "inbound",
        org_id: params.orgId,
        from_number: params.from || null,
        text_content: params.text || null,
        matched_keyword: params.keyword || null,
        processing_result: params.result,
        raw_payload: params.extra ? { ...params.extra, tag: params.tag } : { tag: params.tag },
      });
    } catch (e) {
      console.error("[webhook_logs] insert failed:", (e as any)?.message);
    }
  };

  const change = payload?.entry?.[0]?.changes?.[0];
  const value = change?.value || {};

  // ====== STATUS UPDATES ======
  const statuses = value?.statuses;
  if (Array.isArray(statuses) && statuses.length > 0) {
    for (const st of statuses) {
      try {
        const messageId = st?.id;
        const recipient = cleanPhone(st?.recipient_id);
        const newStatus = st?.status;
        if (!messageId || !newStatus) continue;
        const updates: Record<string, unknown> = { status: newStatus };
        if (newStatus === "failed") {
          const err = st?.errors?.[0];
          updates.error_message = err
            ? `meta_${err.code || "?"}: ${err.title || err.message || ""}`.slice(0, 400)
            : "failed";
          const { data: msgRow } = await admin
            .from("messages_log")
            .select("org_id, content")
            .eq("provider_message_id", messageId)
            .maybeSingle();
          if (msgRow?.org_id) {
            await admin.from("meta_errors").insert({
              org_id: msgRow.org_id,
              recipient,
              error_code: String(err?.code ?? ""),
              error_title: err?.title || err?.message || "Error de Meta",
              error_detail: err?.error_data?.details || err?.message || null,
              message_content: msgRow?.content || null,
              provider_message_id: messageId,
              raw: st,
            });
          }
        }
        await admin.from("messages_log").update(updates).eq("provider_message_id", messageId);
      } catch (e) {
        console.log("[status] update failed:", (e as any)?.message);
      }
    }
    if (!Array.isArray(value?.messages) || value.messages.length === 0) {
      return ok({ statuses: statuses.length });
    }
    console.log("[status] processed, continuing with inbound message in same payload");
  }

  // ====== INBOUND MESSAGE ======
  // 1) Extraer identificadores de Meta del payload (modo estricto)
  const phoneNumberId: string | null = value?.metadata?.phone_number_id || null;
  const wabaId: string | null = payload?.entry?.[0]?.id || null;
  const message = value?.messages?.[0];

  if (!message) {
    await logWebhook({ orgId: orgIdParam, result: "skipped:no_message", extra: { phoneNumberId, wabaId } });
    return ok({ skipped: "no_message" });
  }

  // 2) ENRUTAMIENTO INTELIGENTE — resolver org_id desde phone_number_id (bypass RLS via admin)
  let orgId: string | null = orgIdParam;
  let metaCfg: { phone_number_id: string | null; access_token: string | null; org_id: string } | null = null;

  if (phoneNumberId) {
    const { data: cfgRow, error: cfgErr } = await admin
      .from("whatsapp_meta_config")
      .select("org_id, phone_number_id, access_token")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    if (cfgErr) console.error("[routing] meta_config select error:", cfgErr.message);
    if (cfgRow?.org_id) {
      orgId = cfgRow.org_id;
      metaCfg = cfgRow as any;
    }
  }

  // Fallback: si vino ?org_id= en la URL, cargar su config
  if (!metaCfg && orgId) {
    const { data: cfgByOrg } = await admin
      .from("whatsapp_meta_config")
      .select("org_id, phone_number_id, access_token")
      .eq("org_id", orgId)
      .maybeSingle();
    if (cfgByOrg) metaCfg = cfgByOrg as any;
  }

  if (!orgId) {
    await logWebhook({
      orgId: null,
      result: `routing_failed:no_org_for_phone_number_id:${phoneNumberId || "unknown"}`,
      extra: { phoneNumberId, wabaId },
    });
    return ok({ routed: false, reason: "no_org_for_phone_number_id", phoneNumberId, wabaId });
  }

  // 3) Owner de la org (para filtrar automations por user_id si corresponde)
  let ownerUserId: string | null = null;
  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("user_id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    ownerUserId = prof?.user_id || null;
  } catch { /* ignore */ }

  // 4) Datos del mensaje
  const messageId = message?.id || null;
  const from = cleanPhone(message?.from);
  const name = value?.contacts?.[0]?.profile?.name || null;

  let text: string | null = null;
  if (message?.type === "text") text = message?.text?.body || null;
  else if (message?.type === "button") text = message?.button?.text || null;
  else if (message?.type === "interactive") {
    text =
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      null;
  } else if (message?.type === "image") text = message?.image?.caption || "[imagen]";
  else if (message?.type === "video") text = message?.video?.caption || "[video]";
  else if (message?.type === "audio") text = "[audio]";
  else if (message?.type === "document") text = message?.document?.filename ? `[documento] ${message.document.filename}` : "[documento]";
  else if (message?.type === "sticker") text = "[sticker]";
  else if (message?.type === "location") text = "[ubicación]";
  else if (message?.type === "contacts") text = "[contacto]";
  if (!text) text = `[${message?.type || "mensaje"}]`;

  if (!from) {
    await logWebhook({ orgId, result: "skipped:no_from", from: null, text });
    return ok({ skipped: "no_from" });
  }

  const phoneOnly = from;
  const clientName = name || phoneOnly;

  // 5) Lead (no bloqueante)
  let leadId: string | null = null;
  try {
    const { data: existingLead } = await admin
      .from("leads").select("id").eq("org_id", orgId).eq("phone", phoneOnly).limit(1).maybeSingle();
    leadId = existingLead?.id || null;
    if (!leadId) {
      const { data: createdLead, error: leadInsErr } = await admin
        .from("leads")
        .insert({ org_id: orgId, name: clientName, phone: phoneOnly, status: "nuevo" })
        .select("id").maybeSingle();
      if (leadInsErr) console.error("[lead-insert] error:", leadInsErr.message);
      leadId = createdLead?.id || null;
    }
  } catch (e) {
    console.error("[lead] unexpected error:", (e as any)?.message);
  }

  // 6) Contact (no bloqueante)
  let contactId: string | null = null;
  let contactTags: string[] = [];
  try {
    const { data: existingContact } = await admin
      .from("contacts").select("id, tags").eq("org_id", orgId).eq("phone", phoneOnly).maybeSingle();
    contactId = existingContact?.id || null;
    contactTags = Array.isArray(existingContact?.tags) ? existingContact.tags : [];
    if (!contactId) {
      const { data: createdContact, error: cInsErr } = await admin
        .from("contacts")
        .insert({ org_id: orgId, name: clientName, phone: phoneOnly, tags: [] })
        .select("id, tags").maybeSingle();
      if (cInsErr) console.error("[contact-insert] error:", cInsErr.message);
      contactId = createdContact?.id || null;
      contactTags = Array.isArray(createdContact?.tags) ? createdContact.tags : [];
    }
  } catch (e) {
    console.error("[contact] unexpected error:", (e as any)?.message);
  }

  // 7) Automatizaciones por keyword — SOLO de esta organización.
  //    NOTA: aunque dos orgs tengan la misma palabra clave, el filtro por org_id
  //    garantiza aislamiento total entre cuentas.
  let automations: any[] = [];
  try {
    const { data, error: autoErr } = await admin
      .from("automations")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true);
    if (autoErr) console.error("[automations-select] error:", autoErr.message);
    automations = data || [];
  } catch (e) {
    console.error("[automations] unexpected error:", (e as any)?.message);
  }

  // Elegir la automatización MÁS ESPECÍFICA (keyword con mayor longitud que matchea).
  // Evita que una palabra corta como "ia" "robe" mensajes destinados a "curso ia".
  let matched: any = null;
  let bestScore = 0;
  for (const a of automations) {
    const score = keywordMatchScore(text || "", a.trigger_keyword || "");
    if (score > bestScore) {
      bestScore = score;
      matched = a;
    }
  }

  // 8) INSERT INBOUND — crítico para que aparezca en el chat
  const { error: inboundErr } = await admin.from("messages_log").insert({
    org_id: orgId, direction: "inbound", content: text, recipient: phoneOnly,
    lead_id: leadId, status: "received",
    provider_message_id: messageId,
    keyword_matched: matched?.trigger_keyword ?? null,
    automation_id: matched?.id ?? null,
  });
  if (inboundErr) {
    console.error("!!! CRITICAL: insert inbound failed !!!", orgId, phoneOnly, messageId, inboundErr.message, inboundErr.details);
    await logWebhook({ orgId, result: `inbound_insert_failed:${inboundErr.message}`, from: phoneOnly, text });
  }

  if (leadId) {
    await admin.from("leads").update({ last_contact: new Date().toISOString() }).eq("id", leadId);
  }

  if (!matched) {
    await logWebhook({ orgId, result: "no_keyword_match", from: phoneOnly, text, extra: { automation_count: automations.length } });
    return ok({ matched: false, org_id: orgId });
  }

  // 9) Aplicar tag opcional
  const tagToApply = String(matched.tag_to_apply || firstKeyword(matched.trigger_keyword)).trim().toUpperCase();
  if (tagToApply) {
    try {
      if (leadId) {
        const { data: lead } = await admin.from("leads").select("tags").eq("id", leadId).maybeSingle();
        const tags = Array.isArray(lead?.tags) ? lead.tags : [];
        if (!tags.some((t: string) => String(t).toLowerCase() === tagToApply.toLowerCase())) {
          await admin.from("leads").update({ tags: [...tags, tagToApply], updated_at: new Date().toISOString() }).eq("id", leadId);
        }
      }
      if (contactId && !contactTags.some((t: string) => String(t).toLowerCase() === tagToApply.toLowerCase())) {
        await admin.from("contacts").update({ tags: [...contactTags, tagToApply], updated_at: new Date().toISOString() }).eq("id", contactId);
      }
    } catch (error) {
      console.log("[auto-tag] failed:", (error as any)?.message);
    }
  }

  // 10) Disparar respuesta automática via Meta Graph API
  const { data: usageNew } = await admin.rpc("increment_daily_usage", { _org_id: orgId });
  if (usageNew === null) {
    await admin.from("messages_log").insert({
      org_id: orgId, direction: "outbound", content: matched.response_text, recipient: phoneOnly,
      lead_id: leadId, status: "blocked", error_message: "Daily plan limit reached",
      automation_id: matched.id, keyword_matched: matched.trigger_keyword,
    });
    await logWebhook({ orgId, keyword: matched.trigger_keyword, tag: tagToApply, result: "limit_reached", from: phoneOnly, text });
    return ok({ matched: true, sent: false, error: "limit_reached" });
  }

  const displayName = String(name || "Cliente").trim().split(" ")[0] || "Cliente";
  const responseText = String(matched.response_text || "").replace(/\{nombre(_cliente)?\}/gi, displayName);
  const messageBody = responseText + (matched.link_regalo ? `\n${matched.link_regalo}` : "");

  if (!metaCfg?.access_token || !metaCfg?.phone_number_id) {
    await admin.from("messages_log").insert({
      org_id: orgId, direction: "outbound", content: messageBody, recipient: phoneOnly,
      lead_id: leadId, status: "failed", error_message: "missing_meta_config",
      automation_id: matched.id, keyword_matched: matched.trigger_keyword,
    });
    await logWebhook({ orgId, keyword: matched.trigger_keyword, tag: tagToApply, result: "missing_meta_config", from: phoneOnly, text });
    return ok({ matched: true, sent: false, error: "missing_meta_config" });
  }

  const send = await sendMetaText({
    phoneNumberId: metaCfg.phone_number_id,
    accessToken: metaCfg.access_token,
    to: phoneOnly,
    text: messageBody,
  });

  if (!send.ok) {
    const errMsg = `meta_${send.status}: ${JSON.stringify(send.data).slice(0, 400)}`;
    await admin.from("messages_log").insert({
      org_id: orgId, direction: "outbound", content: messageBody, recipient: phoneOnly,
      lead_id: leadId, status: "failed", error_message: errMsg,
      automation_id: matched.id, keyword_matched: matched.trigger_keyword,
    });
    await logWebhook({ orgId, keyword: matched.trigger_keyword, tag: tagToApply, result: `send_failed:${send.status}`, from: phoneOnly, text });
    return ok({ matched: true, sent: false, error: errMsg });
  }

  const sentMsgId = send.data?.messages?.[0]?.id || null;
  await admin.from("messages_log").insert({
    org_id: orgId, direction: "outbound", content: messageBody, recipient: phoneOnly,
    lead_id: leadId, status: "sent",
    provider_message_id: sentMsgId,
    automation_id: matched.id, keyword_matched: matched.trigger_keyword,
  });
  await logWebhook({ orgId, keyword: matched.trigger_keyword, tag: tagToApply, result: "sent", from: phoneOnly, text });
  return ok({ matched: true, sent: true, message_id: sentMsgId, org_id: orgId });
});
