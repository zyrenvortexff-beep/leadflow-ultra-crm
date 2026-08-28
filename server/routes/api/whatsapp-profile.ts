import { defineEventHandler, readBody, getQuery, setResponseHeader } from "h3";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mhzwjoelcjkhhosjutun.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_SERVICE_ROLE_KEY";
const META_GRAPH_VERSION = "v20.0";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Función para subir una imagen binaria a Meta y obtener su profile_picture_handle
async function uploadPhotoToMeta(opts: {
  imageBuffer: ArrayBuffer;
  mimeType: string;
  accessToken: string;
}): Promise<string | null> {
  try {
    const token = opts.accessToken.replace(/^Bearer\s+/i, "");
    const fileLength = opts.imageBuffer.byteLength;
    const fileType = opts.mimeType || "image/jpeg";

    // 1. Iniciar sesión de subida en Meta
    const sessionRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/app/uploads?file_length=${fileLength}&file_type=${fileType}&access_token=${token}`,
      { method: "POST" }
    );
    const sessionData = await sessionRes.json();
    const uploadSessionId = sessionData?.id;
    if (!uploadSessionId) {
      console.error("[meta-upload-session] failed:", sessionData);
      return null;
    }

    // 2. Subir los bytes del archivo a la sesión
    const uploadRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${uploadSessionId}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: "0",
        "Content-Type": "application/octet-stream",
      },
      body: opts.imageBuffer,
    });
    const uploadData = await uploadRes.json();
    const handle = uploadData?.h;
    if (!handle) {
      console.error("[meta-upload-data] failed:", uploadData);
      return null;
    }
    return handle;
  } catch (e) {
    console.error("[uploadPhotoToMeta] error:", e);
    return null;
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Access-Control-Allow-Origin", "*");
  setResponseHeader(event, "Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  setResponseHeader(event, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (event.method === "OPTIONS") return null;

  const query = getQuery(event);
  const orgId = (query.org_id as string) || null;

  // 1. Obtener datos actuales de perfil de Meta
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

    const token = cfg.access_token.replace(/^Bearer\s+/i, "");

    // Obtener perfil y verified name
    const [profileRes, numberRes] = await Promise.all([
      fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${cfg.phone_number_id}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
      fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,name_status`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
    ]);

    const profileData = await profileRes.json().catch(() => ({}));
    const numberData = await numberRes.json().catch(() => ({}));

    const profile = profileData?.data?.[0] || {};
    return {
      ok: true,
      profile: {
        ...profile,
        display_phone_number: numberData?.display_phone_number || "",
        verified_name: numberData?.verified_name || "",
        quality_rating: numberData?.quality_rating || "UNKNOWN",
        name_status: numberData?.name_status || "",
      },
    };
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

    const token = cfg.access_token.replace(/^Bearer\s+/i, "");
    let photoHandle: string | null = null;

    // Si el usuario envió una imagen (URL pública o base64)
    if (body.photo_url) {
      try {
        const imgRes = await fetch(body.photo_url);
        if (imgRes.ok) {
          const imgBuffer = await imgRes.arrayBuffer();
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          photoHandle = await uploadPhotoToMeta({
            imageBuffer: imgBuffer,
            mimeType: contentType,
            accessToken: token,
          });
        }
      } catch (err) {
        console.error("[fetch-photo] error:", err);
      }
    }

    // 1. Actualizar WhatsApp Business Profile
    const payload: Record<string, any> = {
      messaging_product: "whatsapp",
    };

    if (typeof body.about === "string") payload.about = body.about.slice(0, 139);
    if (typeof body.description === "string") payload.description = body.description.slice(0, 512);
    if (typeof body.address === "string") payload.address = body.address.slice(0, 256);
    if (typeof body.email === "string") payload.email = body.email;
    if (typeof body.vertical === "string") payload.vertical = body.vertical;
    if (Array.isArray(body.websites)) payload.websites = body.websites.filter(Boolean).slice(0, 2);
    if (photoHandle) {
      payload.profile_picture_handle = photoHandle;
    }

    const profileUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${cfg.phone_number_id}/whatsapp_business_profile`;
    const profileRes = await fetch(profileUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const profileResult = await profileRes.json();

    // 2. Si el usuario solicitó cambiar el nombre para mostrar de WhatsApp (Display Name)
    let nameChangeResult: any = null;
    if (body.new_display_name && body.new_display_name.trim()) {
      try {
        const nameUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${cfg.phone_number_id}`;
        const nameRes = await fetch(nameUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: body.new_display_name.trim(),
          }),
        });
        nameChangeResult = await nameRes.json().catch(() => ({}));
      } catch (e: any) {
        console.error("[change-display-name] error:", e);
      }
    }

    if (!profileRes.ok) {
      return {
        ok: false,
        error: profileResult?.error?.message || "Error al actualizar perfil en Meta",
        raw: profileResult,
      };
    }

    return {
      ok: true,
      result: profileResult,
      photoUpdated: !!photoHandle,
      nameChangeResult,
    };
  }

  return { ok: false, error: "method_not_allowed" };
});
