import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/layout/AppLayout";
import { Users, MessageSquare, Bot, Smartphone, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useDailyUsage, planLabel } from "@/lib/use-daily-usage";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

interface Stats {
  totalLeads: number;
  todayConversions: number;
  autoMessages: number;
  whatsappStatus: "connected" | "disconnected" | "pending";
  weekly: { day: string; leads: number }[];
}

function Dashboard() {
  const { organization } = useAuth();
  const { usage } = useDailyUsage(organization?.id);
  const [stats, setStats] = useState<Stats>({
    totalLeads: 0,
    todayConversions: 0,
    autoMessages: 0,
    whatsappStatus: "disconnected",
    weekly: [],
  });
  const [loading, setLoading] = useState(true);
  const [waPhone, setWaPhone] = useState<string | null>(null);

  useEffect(() => {
    if (!organization) return;
    setLoading(true);
    const orgId = organization.id;
    const fetchAll = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [leadsRes, convRes, msgsRes, waRes, weekLeadsRes] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("status", "cliente")
          .gte("updated_at", today.toISOString()),
        supabase
          .from("messages_log")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("direction", "outbound"),
        supabase
          .from("whatsapp_meta_config")
          .select("phone_number_id, access_token")
          .eq("org_id", orgId)
          .maybeSingle(),
        supabase
          .from("leads")
          .select("created_at")
          .eq("org_id", orgId)
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);

      const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const weekly: { day: string; leads: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        weekly.push({ day: days[d.getDay()], leads: 0 });
      }
      (weekLeadsRes.data ?? []).forEach((l: { created_at: string }) => {
        const d = new Date(l.created_at);
        const idx = 6 - Math.floor((Date.now() - d.getTime()) / 86400000);
        if (idx >= 0 && idx < 7) weekly[idx].leads++;
      });

      const waCfg = waRes.data as { phone_number_id: string | null; access_token: string | null } | null;
      setStats({
        totalLeads: leadsRes.count ?? 0,
        todayConversions: convRes.count ?? 0,
        autoMessages: msgsRes.count ?? 0,
        whatsappStatus: (waCfg?.phone_number_id && waCfg?.access_token) ? "connected" : "disconnected",
        weekly,
      });
      setLoading(false);
    };
    fetchAll();

    // Realtime subscriptions
    const channel = supabase
      .channel(`dashboard-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `org_id=eq.${orgId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages_log", filter: `org_id=eq.${orgId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_meta_config", filter: `org_id=eq.${orgId}` },
        () => fetchAll(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization]);

  // Fetch live phone number when connected
  useEffect(() => {
    if (!organization || stats.whatsappStatus !== "connected") {
      setWaPhone(null);
      return;
    }
    (async () => {
      const { data: cfg } = await supabase
        .from("whatsapp_meta_config")
        .select("phone_number_id")
        .eq("org_id", organization.id)
        .maybeSingle();
      if (cfg?.phone_number_id) setWaPhone(String(cfg.phone_number_id));
    })();
  }, [organization, stats.whatsappStatus]);

  const cards = [
    {
      label: "Leads totales",
      value: stats.totalLeads.toLocaleString("es"),
      delta: "+12.5%",
      up: true,
      icon: Users,
    },
    {
      label: "Conversiones hoy",
      value: stats.todayConversions.toLocaleString("es"),
      delta: "+8.1%",
      up: true,
      icon: TrendingUp,
    },
    {
      label: "Mensajes automáticos",
      value: stats.autoMessages.toLocaleString("es"),
      delta: "+15.2%",
      up: true,
      icon: Bot,
    },
    {
      label: "Estado WhatsApp",
      value:
        stats.whatsappStatus === "connected"
          ? waPhone ? `+${waPhone.replace(/^\+/, "")}` : "Conectado"
          : stats.whatsappStatus === "pending"
            ? "Pendiente"
            : "Sin conexión",
      delta: stats.whatsappStatus === "connected" ? "Activo" : "Inactivo",
      up: stats.whatsappStatus === "connected",
      icon: Smartphone,
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        description={`Bienvenido${organization ? `, ${organization.name}` : ""}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl p-5 space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))
          : cards.map((c) => (
          <div key={c.label} className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {c.label}
              </div>
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <c.icon className="w-4 h-4 text-primary" />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight">
              {c.value}
            </div>
            <div
              className={`text-xs mt-2 flex items-center gap-1 ${c.up ? "text-success" : "text-destructive"}`}
            >
              {c.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {c.delta}
            </div>
          </div>
        ))}
      </div>

      {usage && (
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-lg">Mensajes hoy</h3>
              <p className="text-xs text-muted-foreground">
                Plan {planLabel(usage.plan)} ·{" "}
                {usage.unlimited
                  ? "Envíos ilimitados"
                  : `${usage.used} de ${usage.limit} usados`}
              </p>
            </div>
            {!usage.unlimited && (
              <span
                className={`text-sm font-semibold ${
                  usage.reached ? "text-destructive" : "text-foreground"
                }`}
              >
                {usage.reached
                  ? "Límite alcanzado, sube de nivel"
                  : `${usage.remaining} restantes`}
              </span>
            )}
          </div>
          <Progress value={usage.unlimited ? 100 : usage.percent} className="h-2" />
        </div>
      )}

      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">Crecimiento semanal de leads</h2>
            <p className="text-sm text-muted-foreground">Últimos 7 días</p>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.weekly}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.65 0.22 255)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="oklch(0.62 0.22 295)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.01 270)" />
              <XAxis dataKey="day" stroke="oklch(0.65 0.01 270)" fontSize={12} />
              <YAxis stroke="oklch(0.65 0.01 270)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.10 0.005 270)",
                  border: "1px solid oklch(0.22 0.01 270)",
                  borderRadius: 12,
                }}
                labelStyle={{ color: "oklch(0.98 0 0)" }}
              />
              <Area
                type="monotone"
                dataKey="leads"
                stroke="oklch(0.65 0.22 255)"
                strokeWidth={3}
                fill="url(#grad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}