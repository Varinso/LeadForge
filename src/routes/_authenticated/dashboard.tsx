import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listCampaigns } from "@/lib/campaigns.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRight, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function statusColor(s: string) {
  switch (s) {
    case "completed":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "scraping":
    case "pending":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "failed":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function Dashboard() {
  const fetchCampaigns = useServerFn(listCampaigns);
  const router = useRouter();
  const query = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fetchCampaigns(),
    refetchInterval: (q) => {
      const data = q.state.data as Array<{ status: string }> | undefined;
      return data?.some((c) => c.status === "pending" || c.status === "scraping") ? 3000 : false;
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Scraped lead lists, organized by niche and location.
            </p>
          </div>
          <Link to="/campaigns/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New campaign
            </Button>
          </Link>
        </div>

        {query.isLoading && (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {query.data && query.data.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <h3 className="font-semibold">No campaigns yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Start your first scrape to see leads roll in.
            </p>
            <Link to="/campaigns/new" className="mt-4 inline-block">
              <Button size="sm">Create your first campaign</Button>
            </Link>
          </div>
        )}

        <div className="grid gap-3">
          {query.data?.map((c) => {
            const leadCount = (c.leads as unknown as Array<{ count: number }>)?.[0]?.count ?? 0;
            return (
              <Link
                key={c.id}
                to="/campaigns/$id"
                params={{ id: c.id }}
                onMouseEnter={() => router.preloadRoute({ to: "/campaigns/$id", params: { id: c.id } })}
                className="group flex items-center justify-between rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/20"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="truncate font-semibold">{c.name}</h3>
                    <Badge variant="secondary" className={statusColor(c.status)}>
                      {c.status === "scraping" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      {c.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {c.niche} · {c.location} · {leadCount}/{c.max_leads} leads ·{" "}
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
