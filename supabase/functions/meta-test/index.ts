// Verifica la conexión global con Meta WhatsApp Cloud API.
// Llama a /v20.0/{phone_number_id} con el access_token de la org del usuario
// (o cualquier config disponible si es superadmin) y reporta el estado.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: { user_id?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const userId = body.user_id?.trim();
  if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);

  const { data: prof } = await admin
    .from("profiles").select("org_id").eq("user_id", userId).maybeSingle();
  if (!prof?.org_id) return json({ ok: false, error: "user_no_tiene_organizacion" });

  let { data: cfg } = await admin
    .from("whatsapp_meta_config")
    .select("phone_number_id, access_token, waba_id, org_id")
    .eq("org_id", prof.org_id)
    .maybeSingle();

  // Fallback: superadmin sin config propia → usa la primera disponible
  if (!cfg?.access_token) {
    const { data: any1 } = await admin
      .from("whatsapp_meta_config")
      .select("phone_number_id, access_token, waba_id, org_id")
      .not("access_token", "is", null)
      .limit(1).maybeSingle();
    cfg = any1 ?? cfg;
  }

  if (!cfg?.access_token || !cfg?.phone_number_id) {
    return json({ ok: false, error: "missing_meta_config", detail: "No hay Phone Number ID o Access Token configurados en ninguna organización." });
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
    return json({
      ok: false,
      status: res.status,
      ms,
      error: data?.error?.message || `HTTP ${res.status}`,
      code: data?.error?.code ?? null,
      raw: data,
    });
  }

  return json({
    ok: true,
    ms,
    phone_number_id: cfg.phone_number_id,
    display_phone_number: data?.display_phone_number,
    verified_name: data?.verified_name,
    quality_rating: data?.quality_rating,
    waba_id: cfg.waba_id,
  });
});
