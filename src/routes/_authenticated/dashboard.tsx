import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listCampaigns, deleteCampaign } from "@/lib/campaigns.functions";
import { getDashboardStats } from "@/lib/stats.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  ArrowRight,
  Loader2,
  Users,
  PhoneCall,
  CalendarCheck,
  TrendingUp,
  Clock,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow, format, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Overview — LeadForge" },
      {
        name: "description",
        content: "Pipeline overview: leads scraped, calls made, connect rate, and upcoming follow-ups.",
      },
      { property: "og:title", content: "Overview — LeadForge" },
      { property: "og:description", content: "Track campaigns, calls, and follow-ups at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function statusColor(s: string) {
  switch (s) {
    case "completed":
      return "bg-primary/20 text-primary-foreground";
    case "scraping":
    case "pending":
      return "bg-accent text-accent-foreground";
    case "failed":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Users;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-border p-5 ${
        highlight ? "bg-primary text-primary-foreground" : "bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-sm ${highlight ? "opacity-80" : "text-muted-foreground"}`}>
          {label}
        </span>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
            highlight ? "bg-background/25" : "bg-accent text-accent-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {sub && (
        <div className={`mt-1 text-xs ${highlight ? "opacity-80" : "text-muted-foreground"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const fetchCampaigns = useServerFn(listCampaigns);
  const fetchStats = useServerFn(getDashboardStats);
  const router = useRouter();

  const query = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fetchCampaigns(),
    refetchInterval: (q) => {
      const data = q.state.data as Array<{ status: string }> | undefined;
      return data?.some((c) => c.status === "pending" || c.status === "scraping") ? 3000 : false;
    },
  });

  const statsQuery = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => fetchStats() });
  const s = statsQuery.data;

  const statuses = s?.statusCounts ?? {};
  const statusTotal = Object.values(statuses).reduce((a, b) => a + b, 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] p-6 lg:p-8">
        <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">Overview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your lead-gen pipeline at a glance.
            </p>
          </div>
          <Link to="/campaigns/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New campaign
            </Button>
          </Link>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total leads"
                value={s?.totals.leads ?? "—"}
                sub={s ? `+${s.totals.newLeadsThisWeek} this week` : undefined}
                icon={Users}
                highlight
              />
              <StatCard
                label="Calls logged"
                value={s?.totals.calls ?? "—"}
                sub={s ? `${s.totals.callsThisWeek} in last 7 days` : undefined}
                icon={PhoneCall}
              />
              <StatCard
                label="Connect rate"
                value={s ? `${s.totals.connectRate}%` : "—"}
                sub={s ? `${s.totals.connected} productive calls` : undefined}
                icon={TrendingUp}
              />
              <StatCard
                label="Meetings booked"
                value={s?.totals.booked ?? "—"}
                sub={s ? `${s.totals.totalMinutes} min on calls` : undefined}
                icon={CalendarCheck}
              />
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Lead pipeline</h2>
              {statusTotal === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No leads yet.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {Object.entries(statuses)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <div key={status} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 truncate text-xs capitalize text-muted-foreground">
                          {status.replace(/_/g, " ")}
                        </span>
                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(count / statusTotal) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs font-medium">{count}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold">Campaigns</h2>
                {query.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              {query.isLoading && (
                <div className="flex justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}

              {query.data && query.data.length === 0 && (
                <div className="p-10 text-center">
                  <h3 className="font-semibold">No campaigns yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start your first scrape to see leads roll in.
                  </p>
                  <Link to="/campaigns/new" className="mt-4 inline-block">
                    <Button size="sm">Create your first campaign</Button>
                  </Link>
                </div>
              )}

              <div className="divide-y divide-border">
                {query.data?.map((c) => {
                  const leadCount = (c.leads as unknown as Array<{ count: number }>)?.[0]?.count ?? 0;
                  return (
                    <div
                      key={c.id}
                      className="group flex items-center justify-between gap-2 px-5 py-4 transition-colors hover:bg-muted/50"
                    >
                      <Link
                        to="/campaigns/$id"
                        params={{ id: c.id }}
                        onMouseEnter={() =>
                          router.preloadRoute({ to: "/campaigns/$id", params: { id: c.id } })
                        }
                        className="flex min-w-0 flex-1 items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-3">
                            <h3 className="truncate font-medium">{c.name}</h3>
                            <Badge variant="secondary" className={statusColor(c.status)}>
                              {c.status === "scraping" && (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              )}
                              {c.status}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {c.niche} · {c.location} · {leadCount}/{c.max_leads} leads ·{" "}
                            {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete campaign ${c.name}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingDelete({ id: c.id, name: c.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Upcoming</h2>
              {(!s || s.upcoming.length === 0) && (
                <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
              )}
              <ul className="space-y-3">
                {s?.upcoming.map((u) => (
                  <li key={u.id} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                      <Clock className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm">{u.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(parseISO(u.at), "MMM d, p")}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <Link to="/calendar" className="mt-4 inline-block text-xs text-primary-foreground/80">
                <Button variant="outline" size="sm" className="w-full">
                  Open calendar
                </Button>
              </Link>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
              {(!s || s.recentCalls.length === 0) && (
                <p className="text-xs text-muted-foreground">No calls logged yet.</p>
              )}
              <ul className="space-y-3">
                {s?.recentCalls.map((c) => (
                  <li key={c.id} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/20">
                      <PhoneCall className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm">{c.lead_name}</div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {c.disposition.replace(/_/g, " ")} ·{" "}
                        {formatDistanceToNow(new Date(c.called_at), { addSuffix: true })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
