import { defineEventHandler, readBody, setResponseHeader } from "h3";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mhzwjoelcjkhhosjutun.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_SERVICE_ROLE_KEY";
const META_GRAPH_VERSION = "v20.0";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Access-Control-Allow-Origin", "*");
  setResponseHeader(event, "Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  setResponseHeader(event, "Access-Control-Allow-Methods", "POST, OPTIONS");

  if (event.method === "OPTIONS") return null;

  let body: { user_id?: string } = {};
  try {
    body = await readBody(event);
  } catch {
    body = {};
  }

  const userId = body.user_id?.trim();
  if (!userId) return { ok: false, error: "missing_user_id" };

  const { data: prof } = await admin
    .from("profiles").select("org_id").eq("user_id", userId).maybeSingle();
  if (!prof?.org_id) return { ok: false, error: "user_no_tiene_organizacion" };

  let { data: cfg } = await admin
    .from("whatsapp_meta_config")
    .select("phone_number_id, access_token, waba_id, org_id")
    .eq("org_id", prof.org_id)
    .maybeSingle();

  if (!cfg?.access_token) {
    const { data: any1 } = await admin
      .from("whatsapp_meta_config")
      .select("phone_number_id, access_token, waba_id, org_id")
      .not("access_token", "is", null)
      .limit(1).maybeSingle();
    cfg = any1 ?? cfg;
  }

  if (!cfg?.access_token || !cfg?.phone_number_id) {
    return { ok: false, error: "missing_meta_config", detail: "No hay Phone Number ID o Access Token configurados." };
  }

  const t0 = Date.now();
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,id`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.access_token}` },
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  const ms = Date.now() - t0;

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      ms,
      error: data?.error?.message || `HTTP ${res.status}`,
      code: data?.error?.code ?? null,
      raw: data,
    };
  }

  return {
    ok: true,
    ms,
    phone_number_id: cfg.phone_number_id,
    display_phone_number: data?.display_phone_number,
    verified_name: data?.verified_name,
    quality_rating: data?.quality_rating,
    waba_id: cfg.waba_id,
  };
});
