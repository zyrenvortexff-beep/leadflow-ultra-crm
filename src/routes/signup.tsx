import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  full_name: z.string().trim().min(2, "Nombre muy corto").max(100),
  org_name: z.string().trim().min(2, "Nombre muy corto").max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
});

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", org_name: "", email: "", password: "" });
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (!accepted) {
      toast.error("Debes aceptar los Términos y las Políticas de Meta para continuar");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: parsed.data.full_name,
          org_name: parsed.data.org_name,
        },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("¡Cuenta creada! Bienvenido.");
    navigate({ to: "/dashboard" });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
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
        <h2 className="text-2xl font-bold mb-2">Crear cuenta</h2>
        <p className="text-sm text-muted-foreground mb-6">14 días gratis · Sin tarjeta</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="full_name">Tu nombre</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="org_name">Nombre de tu empresa</Label>
            <Input
              id="org_name"
              value={form.org_name}
              onChange={(e) => setForm({ ...form, org_name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={6}
              required
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 accent-primary shrink-0"
            />
            <span>
              Acepto los{" "}
              <Link to="/legal" className="text-primary hover:underline">
                Términos y Condiciones de LeadFlow Ultra
              </Link>{" "}
              y las{" "}
              <Link to="/legal" hash="meta-policies" className="text-primary hover:underline">
                Políticas de Uso de Meta para WhatsApp
              </Link>
              .
            </span>
          </label>
          <Button
            type="submit"
            disabled={loading || !accepted}
            className="w-full gradient-brand text-background border-0 glow-blue"
          >
            {loading ? "Creando..." : "Crear cuenta"}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground text-center mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}