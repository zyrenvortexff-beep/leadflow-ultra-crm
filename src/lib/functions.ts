import { supabase } from "@/integrations/supabase/client";

/**
 * Invoca una función del backend.
 * Primero intenta llamar a la API nativa de Cloudflare (/api/{name})
 * y si falla, hace fallback a supabase.functions.invoke.
 */
export async function invokeFunction<T = any>(
  functionName: string,
  body?: any
): Promise<{ data: T | null; error: any }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`/api/${functionName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });

    if (res.ok) {
      const data = await res.json();
      return { data, error: null };
    }

    // Si la respuesta no es OK pero devolvió JSON con error
    try {
      const errJson = await res.json();
      return { data: errJson, error: errJson.error ? new Error(errJson.error) : null };
    } catch {
      return { data: null, error: new Error(`Error ${res.status}: ${res.statusText}`) };
    }
  } catch (err: any) {
    // Fallback a Supabase Edge functions por compatibilidad
    try {
      return await supabase.functions.invoke(functionName, { body });
    } catch (e: any) {
      return { data: null, error: err || e };
    }
  }
}
