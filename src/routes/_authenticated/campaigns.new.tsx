import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createCampaign } from "@/lib/campaigns.functions";
import { AppShell } from "./layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns/new")({
  component: NewCampaign,
});

function NewCampaign() {
  const navigate = useNavigate();
  const create = useServerFn(createCampaign);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [maxLeads, setMaxLeads] = useState(15);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await create({ data: { name, niche, location, max_leads: maxLeads } });
      toast.success("Campaign started — scraping in progress.");
      navigate({ to: "/campaigns/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a niche and location. We'll scrape businesses and draft outreach for each.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-6 rounded-xl border border-border bg-card p-6">
          <div>
            <Label htmlFor="name">Campaign name</Label>
            <Input
              id="name"
              placeholder="Texas fencing outreach — Q3"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="niche">Niche / industry</Label>
              <Input
                id="niche"
                placeholder="Fencing contractors"
                required
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="Austin, TX"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex justify-between">
              <Label>Max leads to scrape</Label>
              <span className="text-sm text-muted-foreground">{maxLeads}</span>
            </div>
            <Slider
              min={5}
              max={50}
              step={5}
              value={[maxLeads]}
              onValueChange={(v) => setMaxLeads(v[0])}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Scraping and AI summaries take about 3–5 seconds per lead.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate({ to: "/dashboard" })}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Start scraping
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
