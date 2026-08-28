import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

    // Caller (verify identity)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // Roles
    const { data: rolesData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const roles = (rolesData ?? []).map((r: { role: string }) => r.role);
    const isSuperadmin = roles.includes("superadmin");
    const isAgent = roles.includes("agent");

    if (action === "invite_client") {
      if (!isAgent && !isSuperadmin) return json({ error: "Not authorized" }, 403);
      const { email, full_name, org_name, plan } = body as {
        email: string;
        full_name: string;
        org_name: string;
        plan: "trial" | "vip" | "pro" | "elite";
      };
      if (!email || !full_name || !org_name || !plan) {
        return json({ error: "Missing fields" }, 400);
      }

      const redirectTo = (body.redirect_to as string | undefined) ?? `${SUPABASE_URL}/accept-invite`;
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name, org_name },
        redirectTo,
      });
      if (invErr || !invited.user) return json({ error: invErr?.message ?? "Invite failed" }, 400);

      const newUserId = invited.user.id;

      // Wait briefly for handle_new_user trigger to create org/profile
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
      if (!orgId) return json({ error: "Org not provisioned" }, 500);

      // Apply requested plan
      await admin.from("organizations").update({ plan_type: plan }).eq("id", orgId);
      // Link to agent (or skip when superadmin self-creating)
      await admin
        .from("agent_clients")
        .insert({ agent_user_id: callerId, org_id: orgId })
        .select()
        .maybeSingle();

      return json({ ok: true, user_id: newUserId, org_id: orgId });
    }

    if (action === "delete_user") {
      if (!isSuperadmin) return json({ error: "Not authorized" }, 403);
      const targetUserId = body.user_id as string;
      if (!targetUserId) return json({ error: "Missing user_id" }, 400);
      if (targetUserId === callerId) return json({ error: "Cannot delete yourself" }, 400);

      // Cascade delete via RPC (clears all org-scoped data, profiles, roles, org)
      const { error: rpcErr } = await admin.rpc("admin_delete_user", { _user_id: targetUserId });
      if (rpcErr) return json({ error: rpcErr.message }, 400);

      // Belt + suspenders: ensure auth user is gone
      await admin.auth.admin.deleteUser(targetUserId).catch(() => {});
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});