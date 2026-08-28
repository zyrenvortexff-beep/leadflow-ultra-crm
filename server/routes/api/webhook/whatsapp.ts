import { defineEventHandler, getQuery, readBody, setResponseHeader, createError } from "h3";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mhzwjoelcjkhhosjutun.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_SERVICE_ROLE_KEY";
const META_GRAPH_VERSION = "v20.0";
const DEFAULT_VERIFY_TOKEN = "LeadFlowoficial2026";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalizeText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

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
    const needle = ` ${k} `;
    if (padded.includes(needle)) {
      if (k.length > best) best = k.length;
    }
  }
  return best;
};

const firstKeyword = (value: unknown) =>
  String(value || "").split(/[,\n;|]+/)[0]?.trim() || "";

const cleanPhone = (value: unknown) => String(value || "").replace(/\D/g, "");

async function downloadAndStoreMetaMedia(opts: {
  mediaId: string;
  accessToken: string;
  orgId: string;
}): Promise<string | null> {
  try {
    const token = opts.accessToken.replace(/^Bearer\s+/i, "");
    const infoRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${opts.mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!infoRes.ok) return null;
    const infoData = await infoRes.json();
    const downloadUrl = infoData?.url;
    const mimeType = infoData?.mime_type || "image/jpeg";
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    if (!downloadUrl) return null;

    const fileRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileRes.ok) return null;
    const fileBuffer = await fileRes.arrayBuffer();

    const fileName = `${opts.orgId}/inbound_${Date.now()}_${opts.mediaId}.${ext}`;
    const { data: uploadData, error: uploadErr } = await admin.storage
      .from("crm-media")
      .upload(fileName, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadErr) {
      console.error("[media-upload] error:", uploadErr);
      return null;
    }

    const { data: pubUrl } = admin.storage.from("crm-media").getPublicUrl(uploadData.path);
    return pubUrl.publicUrl;
  } catch (e) {
    console.error("[media-download] error:", e);
    return null;
  }
}

async function sendMetaMessage(opts: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
  mediaUrl?: string | null;
}) {
  const phoneNumberId = String(opts.phoneNumberId || "").trim();
  const accessToken = String(opts.accessToken || "").trim().replace(/^Bearer\s+/i, "");
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: opts.to,
  };

  if (opts.mediaUrl) {
    payload.type = "image";
    payload.image = {
      link: opts.mediaUrl,
      caption: opts.text || undefined,
    };
  } else {
    payload.type = "text";
    payload.text = { body: opts.text };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, data };
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const method = event.method;

  setResponseHeader(event, "Access-Control-Allow-Origin", "*");
  setResponseHeader(event, "Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  setResponseHeader(event, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (method === "OPTIONS") {
    return null;
  }

  const orgIdParam = (query.org_id as string) || null;

  // ====== GET: Handshake de verificación de Meta ======
  if (method === "GET") {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

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
          .eq("verify_token", token as string)
          .limit(1)
          .maybeSingle();
        valid = !!data;
      }

      if (valid) {
        setResponseHeader(event, "Content-Type", "text/plain");
        return challenge;
      }
      throw createError({ statusCode: 403, statusMessage: "Forbidden token verification" });
    }
    return { ok: true, validation: true };
  }

  if (method !== "POST") {
    return { ok: true };
  }

  let payload: any = null;
  try {
    payload = await readBody(event);
  } catch {
    return { ok: true, note: "non_json_body" };
  }

  if (!payload) return { ok: true, validation: true };

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

  // Status updates
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
      return { ok: true, statuses: statuses.length };
    }
  }

  // Inbound message
  const phoneNumberId: string | null = value?.metadata?.phone_number_id || null;
  const wabaId: string | null = payload?.entry?.[0]?.id || null;
  const message = value?.messages?.[0];

  if (!message) {
    await logWebhook({ orgId: orgIdParam, result: "skipped:no_message", extra: { phoneNumberId, wabaId } });
    return { ok: true, skipped: "no_message" };
  }

  let orgId: string | null = orgIdParam;
  let metaCfg: { phone_number_id: string | null; access_token: string | null; org_id: string } | null = null;

  if (phoneNumberId) {
    const { data: cfgRow } = await admin
      .from("whatsapp_meta_config")
      .select("org_id, phone_number_id, access_token")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    if (cfgRow?.org_id) {
      orgId = cfgRow.org_id;
      metaCfg = cfgRow as any;
    }
  }

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
    return { ok: true, routed: false, reason: "no_org_for_phone_number_id", phoneNumberId, wabaId };
  }

  const messageId = message?.id || null;
  const from = cleanPhone(message?.from);
  const name = value?.contacts?.[0]?.profile?.name || null;

  let text: string | null = null;
  let mediaUrl: string | null = null;

  if (message?.type === "text") text = message?.text?.body || null;
  else if (message?.type === "button") text = message?.button?.text || null;
  else if (message?.type === "interactive") {
    text =
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      null;
  } else if (message?.type === "image") {
    text = message?.image?.caption || "[imagen]";
    if (message?.image?.id && metaCfg?.access_token) {
      mediaUrl = await downloadAndStoreMetaMedia({
        mediaId: message.image.id,
        accessToken: metaCfg.access_token,
        orgId,
      });
    }
  } else if (message?.type === "video") text = message?.video?.caption || "[video]";
  else if (message?.type === "audio") text = "[audio]";
  else if (message?.type === "document") text = message?.document?.filename ? `[documento] ${message.document.filename}` : "[documento]";
  else if (message?.type === "sticker") text = "[sticker]";
  else if (message?.type === "location") text = "[ubicación]";
  else if (message?.type === "contacts") text = "[contacto]";
  if (!text) text = `[${message?.type || "mensaje"}]`;

  if (!from) {
    await logWebhook({ orgId, result: "skipped:no_from", from: null, text });
    return { ok: true, skipped: "no_from" };
  }

  const phoneOnly = from;
  const clientName = name || phoneOnly;

  // 1. Lead
  let leadId: string | null = null;
  try {
    const { data: existingLead } = await admin
      .from("leads").select("id").eq("org_id", orgId).eq("phone", phoneOnly).limit(1).maybeSingle();
    leadId = existingLead?.id || null;
    if (!leadId) {
      const { data: createdLead } = await admin
        .from("leads")
        .insert({ org_id: orgId, name: clientName, phone: phoneOnly, status: "nuevo" })
        .select("id").maybeSingle();
      leadId = createdLead?.id || null;
    }
  } catch (e) {
    console.error("[lead] error:", e);
  }

  // 2. Contact
  let contactId: string | null = null;
  let contactTags: string[] = [];
  try {
    const { data: existingContact } = await admin
      .from("contacts").select("id, tags").eq("org_id", orgId).eq("phone", phoneOnly).maybeSingle();
    contactId = existingContact?.id || null;
    contactTags = Array.isArray(existingContact?.tags) ? existingContact.tags : [];
    if (!contactId) {
      const { data: createdContact } = await admin
        .from("contacts")
        .insert({ org_id: orgId, name: clientName, phone: phoneOnly, tags: [] })
        .select("id, tags").maybeSingle();
      contactId = createdContact?.id || null;
      contactTags = Array.isArray(createdContact?.tags) ? createdContact.tags : [];
    }
  } catch (e) {
    console.error("[contact] error:", e);
  }

  // 3. Automations
  let automations: any[] = [];
  try {
    const { data } = await admin
      .from("automations")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true);
    automations = data || [];
  } catch (e) {
    console.error("[automations] error:", e);
  }

  let matched: any = null;
  let bestScore = 0;
  for (const a of automations) {
    const score = keywordMatchScore(text || "", a.trigger_keyword || "");
    if (score > bestScore) {
      bestScore = score;
      matched = a;
    }
  }

  // 4. Inbound log
  const { error: inboundErr } = await admin.from("messages_log").insert({
    org_id: orgId, direction: "inbound", content: text, recipient: phoneOnly,
    lead_id: leadId, status: "received",
    provider_message_id: messageId,
    keyword_matched: matched?.trigger_keyword ?? null,
    automation_id: matched?.id ?? null,
    media_url: mediaUrl,
  });

  if (leadId) {
    await admin.from("leads").update({ last_contact: new Date().toISOString() }).eq("id", leadId);
  }

  if (!matched) {
    await logWebhook({ orgId, result: "no_keyword_match", from: phoneOnly, text, extra: { automation_count: automations.length } });
    return { ok: true, matched: false, org_id: orgId };
  }

  // 5. Apply Tag
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
      console.log("[auto-tag] error:", error);
    }
  }

  // 6. Send Auto-response
  const { data: usageNew } = await admin.rpc("increment_daily_usage", { _org_id: orgId });
  if (usageNew === null) {
    await admin.from("messages_log").insert({
      org_id: orgId, direction: "outbound", content: matched.response_text, recipient: phoneOnly,
      lead_id: leadId, status: "blocked", error_message: "Daily plan limit reached",
      automation_id: matched.id, keyword_matched: matched.trigger_keyword,
    });
    await logWebhook({ orgId, keyword: matched.trigger_keyword, tag: tagToApply, result: "limit_reached", from: phoneOnly, text });
    return { ok: true, matched: true, sent: false, error: "limit_reached" };
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
    return { ok: true, matched: true, sent: false, error: "missing_meta_config" };
  }

  // Respetar tiempo de espera / delay configurado en la automatización (ej: 2s, 5s)
  const delaySec = Math.min(30, Math.max(0, Number(matched.delay_seconds) || 0));
  if (delaySec > 0) {
    await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
  }

  const send = await sendMetaMessage({
    phoneNumberId: metaCfg.phone_number_id,
    accessToken: metaCfg.access_token,
    to: phoneOnly,
    text: messageBody,
    mediaUrl: matched.media_url || null,
  });

  if (!send.ok) {
    const errMsg = `meta_${send.status}: ${JSON.stringify(send.data).slice(0, 400)}`;
    await admin.from("messages_log").insert({
      org_id: orgId, direction: "outbound", content: messageBody, recipient: phoneOnly,
      lead_id: leadId, status: "failed", error_message: errMsg,
      automation_id: matched.id, keyword_matched: matched.trigger_keyword,
    });
    await logWebhook({ orgId, keyword: matched.trigger_keyword, tag: tagToApply, result: `send_failed:${send.status}`, from: phoneOnly, text });
    return { ok: true, matched: true, sent: false, error: errMsg };
  }

  const sentMsgId = send.data?.messages?.[0]?.id || null;
  await admin.from("messages_log").insert({
    org_id: orgId, direction: "outbound", content: messageBody, recipient: phoneOnly,
    lead_id: leadId, status: "sent",
    provider_message_id: sentMsgId,
    automation_id: matched.id, keyword_matched: matched.trigger_keyword,
    media_url: matched.media_url || null,
  });
  await logWebhook({ orgId, keyword: matched.trigger_keyword, tag: tagToApply, result: "sent", from: phoneOnly, text });
  return { ok: true, matched: true, sent: true, message_id: sentMsgId, org_id: orgId };
});
