import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SuspensionGuard({ children }: { children: React.ReactNode }) {
  const { organization, signOut, refresh, isSuperadmin } = useAuth();
  const [suspended, setSuspended] = useState(organization?.status === "suspended");

  useEffect(() => {
    setSuspended(organization?.status === "suspended");
  }, [organization?.status]);

  useEffect(() => {
    if (!organization?.id) return;
    const ch = supabase
      .channel(`org-status-${organization.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "organizations",
          filter: `id=eq.${organization.id}`,
        },
        (payload) => {
          const next = (payload.new as { status?: string })?.status;
          if (next === "suspended" || next === "active") {
            setSuspended(next === "suspended");
            refresh();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [organization?.id, refresh]);

  // Superadmin nunca queda bloqueado
  if (suspended && !isSuperadmin) {
    return (
      <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex items-center justify-center p-6">
        <div className="glass rounded-3xl p-10 max-w-lg text-center space-y-6 border border-destructive/30">
          <div className="w-20 h-20 rounded-2xl bg-destructive/15 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-10 h-10 text-destructive" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Licencia Restringida</h1>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              Tu licencia ha sido restringida. Comuníquese con su proveedor para realizar el pago
              y reactivar <span className="font-semibold text-foreground">LeadFlow Ultra</span>.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await signOut();
              window.location.href = "/login";
            }}
          >
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}