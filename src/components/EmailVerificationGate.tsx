import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { MailCheck, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function EmailVerificationGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  // Si no hay user, deja pasar (otra capa decide redirigir a login)
  if (!user) return <>{children}</>;

  const verified = !!user.email_confirmed_at || !!(user as { confirmed_at?: string }).confirmed_at;
  if (verified) return <>{children}</>;

  const resend = async () => {
    if (!user.email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
    setResending(false);
    if (error) toast.error(error.message);
    else toast.success("Correo de verificación reenviado");
  };

  const recheck = async () => {
    setChecking(true);
    await supabase.auth.refreshSession();
    setChecking(false);
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="glass rounded-3xl p-10 max-w-lg text-center space-y-6">
        <div className="w-20 h-20 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto">
          <MailCheck className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Verifica tu correo</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Hemos enviado un enlace de confirmación a{" "}
            <span className="text-foreground font-semibold">{user.email}</span>. Debes
            verificarlo para acceder a LeadFlow Ultra.
          </p>
        </div>
        <div className="space-y-2">
          <Button onClick={recheck} disabled={checking} className="w-full gradient-brand text-background border-0">
            <RefreshCw className={`w-4 h-4 mr-2 ${checking ? "animate-spin" : ""}`} />
            Ya verifiqué, continuar
          </Button>
          <Button onClick={resend} disabled={resending} variant="outline" className="w-full">
            {resending ? "Reenviando..." : "Reenviar correo de verificación"}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={async () => {
              await signOut();
              window.location.href = "/login";
            }}
          >
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}