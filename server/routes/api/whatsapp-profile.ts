import { defineEventHandler, readBody, getQuery, setResponseHeader } from "h3";
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
  setResponseHeader(event, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (event.method === "OPTIONS") return null;

  const query = getQuery(event);
  const orgId = (query.org_id as string) || null;

  // 1. Obtener credenciales de Meta de la org
  if (event.method === "GET") {
    if (!orgId) return { ok: false, error: "missing_org_id" };

    const { data: cfg } = await admin
      .from("whatsapp_meta_config")
      .select("phone_number_id, access_token")
      .eq("org_id", orgId)
      .maybeSingle();

    if (!cfg?.phone_number_id || !cfg?.access_token) {
      return { ok: false, error: "missing_meta_config" };
    }

    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${cfg.phone_number_id}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.access_token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || "Error al obtener perfil de Meta" };
    }
    const profile = data?.data?.[0] || {};
    return { ok: true, profile };
  }

  // 2. Actualizar perfil en Meta
  if (event.method === "POST") {
    let body: any = {};
    try {
      body = await readBody(event);
    } catch {
      body = {};
    }

    const targetOrgId = body.org_id || orgId;
    if (!targetOrgId) return { ok: false, error: "missing_org_id" };

    const { data: cfg } = await admin
      .from("whatsapp_meta_config")
      .select("phone_number_id, access_token")
      .eq("org_id", targetOrgId)
      .maybeSingle();

    if (!cfg?.phone_number_id || !cfg?.access_token) {
      return { ok: false, error: "missing_meta_config" };
    }

    const payload: Record<string, any> = {
      messaging_product: "whatsapp",
    };

    if (typeof body.about === "string") payload.about = body.about.slice(0, 139);
    if (typeof body.description === "string") payload.description = body.description.slice(0, 512);
    if (typeof body.address === "string") payload.address = body.address.slice(0, 256);
    if (typeof body.email === "string") payload.email = body.email;
    if (typeof body.vertical === "string") payload.vertical = body.vertical;
    if (Array.isArray(body.websites)) payload.websites = body.websites.filter(Boolean).slice(0, 2);

    // Si viene profile_picture_handle o foto
    if (body.profile_picture_handle) {
      payload.profile_picture_handle = body.profile_picture_handle;
    }

    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${cfg.phone_number_id}/whatsapp_business_profile`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || "Error al actualizar perfil de Meta", raw: data };
    }

    return { ok: true, result: data };
  }

  return { ok: false, error: "method_not_allowed" };
});
