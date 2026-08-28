import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DailyUsage {
  used: number;
  limit: number;
  plan: "trial" | "vip" | "pro" | "elite";
  remaining: number;
  percent: number;
  reached: boolean;
  unlimited: boolean;
}

export function planLabel(p: DailyUsage["plan"]) {
  return p === "trial" ? "Trial" : p === "vip" ? "VIP" : p === "pro" ? "Pro" : "Elite";
}

export function useDailyUsage(orgId: string | null | undefined) {
  const [usage, setUsage] = useState<DailyUsage | null>(null);

  const refresh = async () => {
    if (!orgId) return;
    const { data } = await supabase.rpc("get_daily_usage", { _org_id: orgId });
    const row = (data as Array<{ used: number; plan_limit: number; plan: DailyUsage["plan"] }> | null)?.[0];
    if (!row) return;
    const unlimited = row.plan === "elite";
    const limit = row.plan_limit;
    const used = row.used;
    const remaining = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);
    const percent = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
    setUsage({
      used,
      limit,
      plan: row.plan,
      remaining,
      percent,
      reached: !unlimited && used >= limit,
      unlimited,
    });
  };

  useEffect(() => {
    refresh();
    if (!orgId) return;
    const ch = supabase
      .channel(`usage-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_usage", filter: `org_id=eq.${orgId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return { usage, refresh };
}