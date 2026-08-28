import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { SuspensionGuard } from "@/components/SuspensionGuard";
import { EmailVerificationGate } from "@/components/EmailVerificationGate";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

function AppShell() {
  const { loading, orgLoading, user, profile, organization, refresh } = useAuth();
  const navigate = useNavigate();
  const [provisioning, setProvisioning] = useState(false);
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  // Auto-provision an organization if the profile loaded but org_id is missing.
  // Avoids ever showing the legacy "Crear organización" prompt.
  useEffect(() => {
    if (!user || orgLoading || provisioning) return;
    if (profile && !profile.org_id) {
      setProvisioning(true);
      supabase.rpc("ensure_user_organization").then(async () => {
        await refresh();
        setProvisioning(false);
      });
    }
  }, [user, profile, orgLoading, provisioning, refresh]);

  if (loading || (user && orgLoading) || provisioning || (user && profile && !organization)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <div className="text-muted-foreground text-sm">Preparando tu espacio de trabajo…</div>
        </div>
      </div>
    );
  }
  if (!user) {
    return null;
  }
  return (
    <EmailVerificationGate>
      <SuspensionGuard>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </SuspensionGuard>
    </EmailVerificationGate>
  );
}