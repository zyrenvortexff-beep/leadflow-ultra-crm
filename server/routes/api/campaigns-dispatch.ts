import { defineEventHandler, readBody, setResponseHeader } from "h3";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mhzwjoelcjkhhosjutun.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_SERVICE_ROLE_KEY";
const META_GRAPH_VERSION = "v20.0";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function personalize(template: string, name: string | null, phone: string) {
  const display = (name && String(name).trim().split(" ")[0]) || "Cliente";
  return String(template || "")
    .replace(/\{nombre(_cliente)?\}/gi, display)
    .replace(/\{telefono\}/gi, phone);
}

function normalizePhone(p: string) {
  let n = String(p || "").replace(/\D/g, "");
  if (n.length === 8 && /^[3789]/.test(n)) n = `504${n}`;
  return n;
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
  setResponseHeader(event, "Access-Control-Allow-Origin", "*");
  setResponseHeader(event, "Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  setResponseHeader(event, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (event.method === "OPTIONS") return null;

  let onlyId: string | null = null;
  if (event.method === "POST") {
    try {
      const body = await readBody(event);
      onlyId = body?.campaign_id ?? null;
    } catch { /* ignore */ }
  }

  const serverNow = new Date().toISOString();
  let q = admin.from("campaigns").select("*").eq("status", "scheduled");
  if (onlyId) q = q.eq("id", onlyId);
  else q = q.lte("schedule_time", serverNow);
  const { data: campaigns, error } = await q;
  if (error) return { error: error.message };

  const results: Record<string, unknown>[] = [];
  const startedAt = Date.now();
  const MAX_RUN_MS = 50_000;

  for (const c of campaigns ?? []) {
    const { error: lockErr } = await admin
      .from("campaigns")
      .update({ status: "draft" })
      .eq("id", c.id)
      .eq("status", "scheduled");
    if (lockErr) {
      results.push({ id: c.id, error: "lock_failed" });
      continue;
    }

    const recipients: { phone: string; name: string | null }[] = [];
    const audience = (c as any).audience_type || "leads";

    if (audience === "contacts") {
      const ids: string[] = (c as any).contact_ids ?? [];
      if (ids.length > 0) {
        const { data: cts } = await admin.from("contacts").select("name,phone").in("id", ids);
        (cts ?? []).forEach((r: any) => recipients.push({ phone: normalizePhone(r.phone), name: r.name }));
      }
    } else if (audience === "manual") {
      const nums: string[] = (c as any).manual_numbers ?? [];
      nums.forEach((n) => recipients.push({ phone: normalizePhone(n), name: null }));
    } else {
      let lq = admin.from("leads").select("name,phone").eq("org_id", c.org_id);
      if (Array.isArray(c.target_tags) && c.target_tags.length > 0) {
        lq = lq.overlaps("tags", c.target_tags);
      }
      const { data: ls } = await lq;
      (ls ?? []).forEach((r: any) => recipients.push({ phone: normalizePhone(r.phone), name: r.name }));
    }

    const valid = recipients.filter((r) => r.phone && r.phone.length >= 6);
    const alreadySent = Math.max(0, Number(c.sent_count) || 0);
    let sent = alreadySent;
    let failed = 0;
    let timedOut = false;

    await admin
      .from("campaigns")
      .update({ status: "scheduled", total_leads: valid.length })
      .eq("id", c.id);

    const { data: cfg } = await admin
      .from("whatsapp_meta_config")
      .select("phone_number_id, access_token")
      .eq("org_id", c.org_id)
      .maybeSingle();

    if (!cfg?.phone_number_id || !cfg?.access_token) {
      await admin
        .from("campaigns")
        .update({ status: "sent", total_leads: valid.length, sent_at: new Date().toISOString() })
        .eq("id", c.id);
      results.push({ id: c.id, sent, failed: 0, total: valid.length, error: "missing_meta_config" });
      continue;
    }

    const pending = valid.slice(alreadySent);

    for (const r of pending) {
      if (Date.now() - startedAt > MAX_RUN_MS) {
        timedOut = true;
        break;
      }

      const { data: usageNew, error: usageErr } = await admin.rpc("increment_daily_usage", { _org_id: c.org_id });
      if (usageErr || usageNew === null) {
        await admin.from("messages_log").insert({
          org_id: c.org_id, direction: "outbound", content: c.message_body, media_url: c.media_url || null,
          recipient: r.phone, status: "blocked", error_message: "Daily plan limit reached",
        });
        failed++;
        break;
      }

      const messageBody = personalize(c.message_body, r.name, r.phone);
      const result = await sendMetaMessage({
        phoneNumberId: cfg.phone_number_id,
        accessToken: cfg.access_token,
        to: r.phone,
        text: messageBody,
        mediaUrl: c.media_url || null,
      });

      if (result.ok) {
        const sentMsgId = result.data?.messages?.[0]?.id || null;
        await admin.from("messages_log").insert({
          org_id: c.org_id, direction: "outbound", content: messageBody, media_url: c.media_url || null,
          recipient: r.phone, status: "sent", provider_message_id: sentMsgId,
        });
        sent++;
        await admin.from("campaigns").update({ sent_count: sent }).eq("id", c.id);
      } else {
        const errPayload = result.data?.error || {};
        const code = String(errPayload.code ?? result.status);
        const title = errPayload.message || errPayload.title || "Error de Meta";
        const hint =
          code === "131047" ? "Ventana de 24h cerrada. Usa una plantilla aprobada o espera respuesta del cliente." :
          code === "131005" ? "Access denied: revisa que el Access Token tenga el permiso whatsapp_business_messaging y esté vigente." :
          code === "131026" ? "Mensaje no entregable (número no apto para WhatsApp Business)." : null;
        await admin.from("messages_log").insert({
          org_id: c.org_id, direction: "outbound", content: messageBody, media_url: c.media_url || null,
          recipient: r.phone, status: "failed",
          error_message: `meta_${code}: ${title}${hint ? " — " + hint : ""}`.slice(0, 400),
        });
        await admin.from("meta_errors").insert({
          org_id: c.org_id,
          recipient: r.phone,
          error_code: code,
          error_title: title,
          error_detail: errPayload.error_data?.details || errPayload.error_user_msg || hint || null,
          message_content: messageBody,
          raw: result.data,
        });
        failed++;
        sent++;
        await admin.from("campaigns").update({ sent_count: sent }).eq("id", c.id);
      }

      await new Promise((res) => setTimeout(res, 3000));
    }

    if (timedOut) {
      await admin
        .from("campaigns")
        .update({ status: "scheduled", total_leads: valid.length })
        .eq("id", c.id);
      results.push({ id: c.id, sent, failed, total: valid.length, resumed: false, partial: true });
    } else {
      await admin
        .from("campaigns")
        .update({ status: "sent", sent_count: sent, total_leads: valid.length, sent_at: new Date().toISOString() })
        .eq("id", c.id);
      results.push({ id: c.id, sent, failed, total: valid.length });
    }
  }

  return { ok: true, processed: results.length, results };
});
