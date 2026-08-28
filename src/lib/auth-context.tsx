import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "superadmin" | "client_admin" | "agent";

const SUPERADMIN_EMAIL = "teretovector.pan@gmail.com";

interface Profile {
  id: string;
  user_id: string;
  org_id: string | null;
  full_name: string | null;
  avatar: string | null;
}

interface Organization {
  id: string;
  name: string;
  logo: string | null;
  plan_type: "trial" | "vip" | "pro" | "elite";
  status: "active" | "suspended";
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  organization: Organization | null;
  roles: Role[];
  loading: boolean;
  orgLoading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  isSuperadmin: boolean;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgLoading, setOrgLoading] = useState(true);

  const loadUserData = async (uid: string) => {
    setOrgLoading(true);
    const [{ data: prof }, { data: rolesData }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    let workingProfile = prof as Profile | null;
    const dbRoles = (rolesData ?? []).map((r: { role: Role }) => r.role);
    // Hardcoded superadmin override by email
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user?.email === SUPERADMIN_EMAIL && !dbRoles.includes("superadmin")) {
      dbRoles.push("superadmin");
    }
    setRoles(dbRoles);

    // Auto-provision organization if missing
    if (!workingProfile?.org_id) {
      const { data: newOrgId, error: rpcError } = await supabase.rpc("ensure_user_organization");
      if (!rpcError && newOrgId) {
        const { data: refreshed } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", uid)
          .maybeSingle();
        workingProfile = refreshed as Profile | null;
      }
    }

    setProfile(workingProfile);

    if (workingProfile?.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", workingProfile.org_id)
        .maybeSingle();
      setOrganization(org as Organization | null);
    } else {
      setOrganization(null);
    }
    setOrgLoading(false);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      // Solo recargar el perfil/org en login real o salida explícita.
      // TOKEN_REFRESHED y USER_UPDATED no deben disparar setOrgLoading(true)
      // porque hace que la app parezca "cerrar sesión sola" cada hora.
      if (event === "SIGNED_IN" && sess?.user) {
        setOrgLoading(true);
        setTimeout(() => {
          loadUserData(sess.user.id);
        }, 0);
      } else if (event === "SIGNED_OUT") {
        setProfile(null);
        setOrganization(null);
        setRoles([]);
        setOrgLoading(false);
      }
      // INITIAL_SESSION / TOKEN_REFRESHED / USER_UPDATED: no-op (el perfil
      // ya se cargó vía getSession() de abajo).
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        loadUserData(sess.user.id).finally(() => setLoading(false));
      } else {
        setOrgLoading(false);
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refresh = async () => {
    if (user) await loadUserData(user.id);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        profile,
        organization,
        roles,
        loading,
        orgLoading,
        signOut,
        refresh,
        isSuperadmin: roles.includes("superadmin"),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}