import { defineEventHandler, readBody, getHeader, setResponseHeader } from "h3";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mhzwjoelcjkhhosjutun.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_SERVICE_ROLE_KEY";
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Access-Control-Allow-Origin", "*");
  setResponseHeader(event, "Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  setResponseHeader(event, "Access-Control-Allow-Methods", "POST, OPTIONS");

  if (event.method === "OPTIONS") return null;

  try {
    const authHeader = getHeader(event, "authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return { error: "Missing auth" };

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return { error: "Unauthorized" };
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await readBody(event).catch(() => ({}));
    const action = body.action as string;

    const { data: rolesData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const roles = (rolesData ?? []).map((r: { role: string }) => r.role);
    const isSuperadmin = roles.includes("superadmin");
    const isAgent = roles.includes("agent");

    if (action === "invite_client") {
      if (!isAgent && !isSuperadmin) return { error: "Not authorized" };
      const { email, full_name, org_name, plan } = body as {
        email: string;
        full_name: string;
        org_name: string;
        plan: "trial" | "vip" | "pro" | "elite";
      };
      if (!email || !full_name || !org_name || !plan) {
        return { error: "Missing fields" };
      }

      const redirectTo = (body.redirect_to as string | undefined) ?? `${SUPABASE_URL}/accept-invite`;
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name, org_name },
        redirectTo,
      });
      if (invErr || !invited.user) return { error: invErr?.message ?? "Invite failed" };

      const newUserId = invited.user.id;
      let orgId: string | null = null;
      for (let i = 0; i < 10 && !orgId; i++) {
        const { data: prof } = await admin
          .from("profiles")
          .select("org_id")
          .eq("user_id", newUserId)
          .maybeSingle();
        orgId = (prof as { org_id: string | null } | null)?.org_id ?? null;
        if (!orgId) await new Promise((r) => setTimeout(r, 400));
      }
      if (!orgId) return { error: "Org not provisioned" };

      await admin.from("organizations").update({ plan_type: plan }).eq("id", orgId);
      await admin
        .from("agent_clients")
        .insert({ agent_user_id: callerId, org_id: orgId })
        .select()
        .maybeSingle();

      return { ok: true, user_id: newUserId, org_id: orgId };
    }

    if (action === "delete_user") {
      if (!isSuperadmin) return { error: "Not authorized" };
      const targetUserId = body.user_id as string;
      if (!targetUserId) return { error: "Missing user_id" };
      if (targetUserId === callerId) return { error: "Cannot delete yourself" };

      const { error: rpcErr } = await admin.rpc("admin_delete_user", { _user_id: targetUserId });
      if (rpcErr) return { error: rpcErr.message };

      await admin.auth.admin.deleteUser(targetUserId).catch(() => {});
      return { ok: true };
    }

    return { error: "Unknown action" };
  } catch (e: any) {
    return { error: e.message };
  }
});
