import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      toast.error("Email y contraseña requeridos");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error("Credenciales incorrectas");
      return;
    }
    toast.success("¡Bienvenido!");
    navigate({ to: "/dashboard" });
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      toast.error("Ingresa tu email");
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Te enviamos un enlace para restablecer tu contraseña");
    setResetMode(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundImage:
          "radial-gradient(800px circle at 30% 30%, color-mix(in oklab, var(--neon-blue) 20%, transparent), transparent 50%), radial-gradient(600px circle at 70% 70%, color-mix(in oklab, var(--neon-violet) 18%, transparent), transparent 50%)",
      }}
    >
      <div className="w-full max-w-md glass rounded-3xl p-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4 transition-colors"
        >
          ← Volver al inicio
        </Link>
        <Link to="/" className="block text-center mb-8">
          <h1 className="text-2xl font-bold text-gradient">LeadFlow Ultra</h1>
        </Link>
        <h2 className="text-2xl font-bold mb-2">Iniciar sesión</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Accede a tu CRM de WhatsApp
        </p>
        {resetMode ? (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
              />
            </div>
            <Button
              type="submit"
              disabled={resetting}
              className="w-full gradient-brand text-background border-0 glow-blue"
            >
              {resetting ? "Enviando..." : "Enviar enlace de recuperación"}
            </Button>
            <button
              type="button"
              onClick={() => setResetMode(false)}
              className="w-full text-sm text-muted-foreground hover:text-primary"
            >
              ← Volver al login
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                tabIndex={-1}
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setResetMode(true)}
              className="text-xs text-primary hover:underline mt-2"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full gradient-brand text-background border-0 glow-blue"
          >
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
        )}
        <p className="text-sm text-muted-foreground text-center mt-6">
          ¿No tienes cuenta?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}