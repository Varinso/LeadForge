import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createCampaign } from "@/lib/campaigns.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const TARGETS = [
  { id: "SEO", desc: "Rankings & Google visibility" },
  { id: "Website redesign", desc: "Outdated or missing websites" },
  { id: "Google Ads / PPC", desc: "Paid search campaigns" },
  { id: "Social media", desc: "Facebook, Instagram presence" },
  { id: "Reviews & reputation", desc: "Few or poor reviews" },
  { id: "Local SEO / Maps", desc: "Google Business Profile" },
];
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
  const [targets, setTargets] = useState<string[]>(["SEO"]);
  const [notes, setNotes] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [emailSearch, setEmailSearch] = useState(true);
  const [callScript, setCallScript] = useState(false);
  const [reqWebsite, setReqWebsite] = useState(false);
  const [reqEmail, setReqEmail] = useState(false);
  const [reqPhone, setReqPhone] = useState(false);
  const toggleTarget = (t: string) =>
    setTargets((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await create({
        data: {
          name,
          niche,
          location,
          max_leads: maxLeads,
          targets,
          target_notes: notes,
          ai_enabled: aiEnabled,
          email_search: emailSearch,
          call_script: aiEnabled && callScript,
          require_website: reqWebsite,
          require_email: reqEmail,
          require_phone: reqPhone,
        },
      });
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

          <div>
            <Label>What are you selling?</Label>
            <p className="mb-2 text-xs text-muted-foreground">
              Pick your services. Summaries, scores and emails will focus on these.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TARGETS.map((t) => {
                const on = targets.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleTarget(t.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      on ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="text-sm font-medium">{t.id}</div>
                    <div className="text-xs text-muted-foreground">{t.desc}</div>
                  </button>
                );
              })}
            </div>
            <Textarea
              className="mt-3"
              rows={3}
              placeholder="Describe your ideal customer, e.g. 'HVAC companies with old websites and under 50 reviews'"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <Label>What should we do for each lead?</Label>
            {[
              { label: "AI summary & email draft", desc: "Write a summary and a personalized cold email", v: aiEnabled, set: setAiEnabled, disabled: false },
              { label: "Email search", desc: "Look through their website for a contact email", v: emailSearch, set: setEmailSearch, disabled: false },
              { label: "Call script", desc: "Write a phone script for your calls", v: aiEnabled && callScript, set: setCallScript, disabled: !aiEnabled },
            ].map((o) => (
              <div key={o.label} className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground">{o.desc}</div>
                </div>
                <Switch checked={o.v} disabled={o.disabled} onCheckedChange={o.set} />
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <Label>Lead filters</Label>
            <p className="text-xs text-muted-foreground">
              Only collect businesses that have these. Leads missing them are skipped entirely.
            </p>
            {[
              { label: "Must have a website", desc: "Skip businesses with no site to audit or pitch", v: reqWebsite, set: setReqWebsite },
              { label: "Must have an email", desc: "Only keep leads where we found a contact email", v: reqEmail, set: setReqEmail },
              { label: "Must have a phone number", desc: "Only keep leads with a callable number", v: reqPhone, set: setReqPhone },
            ].map((o) => (
              <div key={o.label} className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground">{o.desc}</div>
                </div>
                <Switch checked={o.v} onCheckedChange={o.set} />
              </div>
            ))}
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
