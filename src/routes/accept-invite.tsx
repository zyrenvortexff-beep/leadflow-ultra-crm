import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

export const Route = createFileRoute("/accept-invite")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState({ full_name: "", org_name: "", password: "" });
  const [loading, setLoading] = useState(false);

  // The invite link from Supabase puts an access_token in the URL hash.
  // The Supabase client auto-handles it, so we just wait for the session.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      // Try a few times in case the session is still being established from the hash
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user?.email) {
          if (cancelled) return;
          setEmail(data.session.user.email);
          setForm((f) => ({
            ...f,
            full_name:
              (data.session?.user.user_metadata?.full_name as string) ?? "",
            org_name:
              (data.session?.user.user_metadata?.org_name as string) ?? "",
          }));
          setReady(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!cancelled) {
        toast.error("Enlace inválido o expirado. Solicita una nueva invitación.");
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);

    // Solo establecemos la contraseña. El nombre y el negocio los fijó el agente y no se editan.
    const { error: updErr } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (updErr) {
      setLoading(false);
      return toast.error(updErr.message);
    }

    // Aseguramos que el perfil y la organización mantengan exactamente lo que asignó el agente.
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (uid) {
      await supabase.rpc("ensure_user_organization");

      if (form.full_name) {
        await supabase
          .from("profiles")
          .update({ full_name: form.full_name })
          .eq("user_id", uid);
      }

      if (form.org_name) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("user_id", uid)
          .maybeSingle();
        if (prof?.org_id) {
          await supabase
            .from("organizations")
            .update({ name: form.org_name })
            .eq("id", prof.org_id);
        }
      }
    }

    setLoading(false);
    toast.success("¡Cuenta lista! Bienvenido a LeadFlow Ultra.");
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
        <Link to="/" className="block text-center mb-6">
          <h1 className="text-2xl font-bold text-gradient">LeadFlow Ultra</h1>
        </Link>
        <h2 className="text-2xl font-bold mb-2">Completar registro</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Tu agente te ha invitado. Tu nombre y negocio ya fueron asignados — solo crea tu
          contraseña para activar la cuenta.
        </p>

        {!ready ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            Validando invitación…
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} disabled className="opacity-70" />
            </div>
            <div>
              <Label htmlFor="full_name">Nombre completo</Label>
              <Input
                id="full_name"
                value={form.full_name}
                disabled
                className="opacity-70"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Asignado por tu agente. No editable.
              </p>
            </div>
            <div>
              <Label htmlFor="org_name">Nombre del negocio</Label>
              <Input
                id="org_name"
                value={form.org_name}
                disabled
                className="opacity-70"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Asignado por tu agente. No editable.
              </p>
            </div>
            <div>
              <Label htmlFor="password">Contraseña *</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={6}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full gradient-brand text-background border-0 glow-blue"
            >
              {loading ? "Activando cuenta..." : "Crear contraseña y entrar"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
