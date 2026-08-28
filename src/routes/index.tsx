import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Bot,
  MessageSquare,
  Megaphone,
  Users,
  Zap,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  PlayCircle,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

const benefits = [
  { icon: ShieldCheck, title: "API Oficial de Meta", desc: "Conexión directa y verificada." },
  { icon: Bot, title: "Automatización IA", desc: "Respuestas 24/7 inteligentes." },
  { icon: Users, title: "Gestión de Leads", desc: "Kanban visual de ventas." },
  { icon: Megaphone, title: "Campañas Masivas", desc: "Broadcasts segmentados." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-[#020617] text-white relative overflow-hidden">
      {/* Dynamic background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(1200px circle at 15% 10%, rgba(37,99,235,0.30), transparent 55%), radial-gradient(900px circle at 90% 20%, rgba(124,58,237,0.32), transparent 55%), radial-gradient(700px circle at 75% 95%, rgba(37,211,102,0.18), transparent 55%), radial-gradient(900px circle at 10% 95%, rgba(124,58,237,0.20), transparent 55%)",
          }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />
        {/* Floating orbs */}
        <div className="absolute top-1/3 -left-32 w-96 h-96 rounded-full bg-[#2563EB]/30 blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] rounded-full bg-[#7C3AED]/25 blur-[140px]" />
        <div className="absolute top-10 right-1/3 w-72 h-72 rounded-full bg-[#25D366]/15 blur-[120px]" />
      </div>

      {/* Navbar */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] shadow-[0_0_30px_-5px_rgba(124,58,237,0.7)] flex items-center justify-center">
            <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-lg tracking-tight">LeadFlow Ultra</span>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-white/5">
              Iniciar sesión
            </Button>
          </Link>
          <Link to="/signup">
            <Button
              size="sm"
              className="bg-gradient-to-r from-[#2563EB] to-[#7C3AED] hover:opacity-90 text-white border-0 shadow-[0_0_30px_-5px_rgba(37,99,235,0.7)]"
            >
              Empezar gratis
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 pt-10 md:pt-16 pb-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Left column */}
          <div className="text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-xs text-slate-200 mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#25D366] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#25D366]" />
              </span>
              <span className="font-medium">API oficial de Meta + Automatización por WhatsApp</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Vende más por{" "}
              <span className="bg-gradient-to-r from-[#25D366] to-[#34d399] bg-clip-text text-transparent">
                WhatsApp
              </span>
              , automatiza todo con la{" "}
              <span className="bg-gradient-to-r from-[#2563EB] to-[#7C3AED] bg-clip-text text-transparent">
                API oficial de Meta
              </span>
              .
            </h1>

            <p className="mt-6 text-base md:text-lg text-slate-300 max-w-xl leading-relaxed">
              Conecta tu WhatsApp, captura leads, responde automáticamente y gestiona campañas desde
              una sola plataforma.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-[#2563EB] to-[#7C3AED] hover:opacity-90 text-white border-0 shadow-[0_0_40px_-8px_rgba(124,58,237,0.8)] h-12 px-6"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Crear cuenta gratis
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              <a href="https://tutometa.space-z.ai" target="_blank" rel="noopener noreferrer">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 bg-white/5 border-white/15 text-white hover:bg-white/10 backdrop-blur-md"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Ver demo
                </Button>
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#25D366]" />
                Precios accesibles
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#25D366]" />
                Setup en 5 minutos
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#25D366]" />
                CRM todo en uno
              </div>
            </div>
          </div>

          {/* Right column — mockup */}
          <div className="relative">
            {/* Glow behind */}
            <div className="absolute -inset-8 bg-gradient-to-br from-[#2563EB]/30 via-[#7C3AED]/30 to-[#25D366]/20 blur-3xl rounded-full" />

            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-950/90 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                <div className="ml-3 text-[10px] text-slate-500 font-mono">app.leadflow.io/dashboard</div>
              </div>

              {/* Dashboard body */}
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400">Bienvenido</div>
                    <div className="text-sm font-semibold">Panel de ventas</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                    WhatsApp conectado
                  </div>
                </div>

                {/* Metric cards grid */}
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Leads" value="1,284" delta="+12%" tint="blue" icon={Users} />
                  <MetricCard label="Mensajes auto" value="9,372" delta="+34%" tint="violet" icon={MessageSquare} />
                  <MetricCard label="Conversión" value="28.4%" delta="+5.2%" tint="green" icon={TrendingUp} />
                  <MetricCard label="Campañas" value="14" delta="activas" tint="blue" icon={Megaphone} />
                </div>

                {/* Mini chart */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-slate-300 font-medium">Conversaciones — últimos 7 días</div>
                    <div className="text-[10px] text-[#25D366]">+22.4%</div>
                  </div>
                  <div className="flex items-end gap-1.5 h-20">
                    {[40, 60, 45, 75, 55, 85, 95].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-[#2563EB] to-[#7C3AED]" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating cards */}
            <div className="hidden md:flex absolute -left-6 top-1/3 items-center gap-2.5 rounded-xl border border-white/10 bg-slate-900/80 backdrop-blur-xl px-3.5 py-2.5 shadow-[0_10px_40px_-10px_rgba(37,99,235,0.6)]">
              <div className="w-8 h-8 rounded-lg bg-[#25D366]/20 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-[#25D366]" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Nuevo mensaje</div>
                <div className="text-xs font-semibold">+34 hoy</div>
              </div>
            </div>

            <div className="hidden md:flex absolute -right-4 bottom-10 items-center gap-2.5 rounded-xl border border-white/10 bg-slate-900/80 backdrop-blur-xl px-3.5 py-2.5 shadow-[0_10px_40px_-10px_rgba(124,58,237,0.6)]">
              <div className="w-8 h-8 rounded-lg bg-[#7C3AED]/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-[#a78bfa]" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Bot IA</div>
                <div className="text-xs font-semibold">98% precisión</div>
              </div>
            </div>
          </div>
        </div>

        {/* Benefits row */}
        <div className="mt-20 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-5 hover:border-white/20 hover:bg-white/[0.06] transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB]/20 to-[#7C3AED]/20 border border-white/10 flex items-center justify-center mb-3 group-hover:from-[#2563EB]/40 group-hover:to-[#7C3AED]/40 transition-all">
                <b.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-sm mb-1">{b.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  tint,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: string;
  tint: "blue" | "violet" | "green";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tints = {
    blue: "from-[#2563EB]/20 to-[#2563EB]/5 text-[#60a5fa]",
    violet: "from-[#7C3AED]/20 to-[#7C3AED]/5 text-[#a78bfa]",
    green: "from-[#25D366]/20 to-[#25D366]/5 text-[#25D366]",
  }[tint];
  return (
    <div className={`rounded-xl border border-white/10 bg-gradient-to-br ${tints} p-3`}>
      <div className="flex items-center justify-between mb-1.5">
        <Icon className="w-3.5 h-3.5 opacity-80" />
        <span className="text-[9px] font-semibold opacity-90">{delta}</span>
      </div>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}
