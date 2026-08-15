import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [leadsRes, campaignsRes, callsRes, recentCallsRes, upcomingRes, eventsRes] =
      await Promise.all([
        supabase.from("leads").select("id, status, created_at").eq("user_id", userId),
        supabase.from("campaigns").select("id, status").eq("user_id", userId),
        supabase
          .from("call_logs")
          .select("id, disposition, called_at, duration_seconds")
          .eq("user_id", userId),
        supabase
          .from("call_logs")
          .select("id, lead_id, disposition, called_at, notes")
          .eq("user_id", userId)
          .order("called_at", { ascending: false })
          .limit(6),
        supabase
          .from("call_logs")
          .select("id, lead_id, follow_up_at")
          .eq("user_id", userId)
          .not("follow_up_at", "is", null)
          .gte("follow_up_at", new Date().toISOString())
          .order("follow_up_at", { ascending: true })
          .limit(5),
        supabase
          .from("calendar_events")
          .select("id, title, starts_at")
          .eq("user_id", userId)
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(5),
      ]);

    const leads = leadsRes.data ?? [];
    const calls = callsRes.data ?? [];
    const campaigns = campaignsRes.data ?? [];

    const leadIds = new Set<string>();
    (recentCallsRes.data ?? []).forEach((r) => leadIds.add(r.lead_id));
    (upcomingRes.data ?? []).forEach((r) => leadIds.add(r.lead_id));
    let leadMap: Record<string, { name: string; campaign_id: string }> = {};
    if (leadIds.size) {
      const { data: rows } = await supabase
        .from("leads")
        .select("id, name, campaign_id")
        .in("id", Array.from(leadIds));
      leadMap = Object.fromEntries((rows ?? []).map((l) => [l.id, l]));
    }

    const statusCounts: Record<string, number> = {};
    for (const l of leads) statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;

    const callsThisWeek = calls.filter((c) => c.called_at >= weekAgo).length;
    const connected = calls.filter((c) =>
      ["connected", "booked", "callback_requested"].includes(c.disposition),
    ).length;
    const booked = calls.filter((c) => c.disposition === "booked").length;
    const totalMinutes = Math.round(
      calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60,
    );

    return {
      totals: {
        leads: leads.length,
        campaigns: campaigns.length,
        activeCampaigns: campaigns.filter((c) =>
          ["pending", "scraping"].includes(c.status),
        ).length,
        calls: calls.length,
        callsThisWeek,
        connected,
        booked,
        totalMinutes,
        newLeadsThisWeek: leads.filter((l) => l.created_at >= weekAgo).length,
        connectRate: calls.length ? Math.round((connected / calls.length) * 100) : 0,
      },
      statusCounts,
      recentCalls: (recentCallsRes.data ?? []).map((r) => ({
        ...r,
        lead_name: leadMap[r.lead_id]?.name ?? "Unknown lead",
        campaign_id: leadMap[r.lead_id]?.campaign_id ?? "",
      })),
      upcoming: [
        ...(upcomingRes.data ?? []).map((r) => ({
          id: `f-${r.id}`,
          at: r.follow_up_at as string,
          title: `Follow-up · ${leadMap[r.lead_id]?.name ?? "Lead"}`,
        })),
        ...(eventsRes.data ?? []).map((e) => ({
          id: `e-${e.id}`,
          at: e.starts_at,
          title: e.title,
        })),
      ]
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(0, 6),
    };
  });

/** Highest-scoring leads that haven't been worked yet — "who to call next". */
export const getTopProspects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, name, campaign_id, phone, email, website, status, lead_score, score_tier, score_reasons, ai_summary",
      )
      .eq("user_id", userId)
      .in("status", ["new", "interested"])
      .not("lead_score", "is", null)
      .order("lead_score", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
