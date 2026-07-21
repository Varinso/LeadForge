import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getGhlSettings, saveGhlSettings } from "@/lib/ghl.functions";
import { toast } from "sonner";
import { Loader2, Phone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const fetchSettings = useServerFn(getGhlSettings);
  const save = useServerFn(saveGhlSettings);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ghl-settings"],
    queryFn: () => fetchSettings(),
  });

  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setLocationId(data.location_id ?? "");
      setAgentPhone(data.agent_phone ?? "");
    }
  }, [data]);

  async function handleSave() {
    if (!apiKey && !data?.configured) {
      toast.error("API key is required");
      return;
    }
    if (!locationId) {
      toast.error("Location ID is required");
      return;
    }
    setSaving(true);
    try {
      await save({
        data: {
          // If already configured and user didn't retype, reuse the masked marker to signal no change
          // — but our server requires a real key, so require entry on first save only.
          api_key: apiKey || "REUSE_EXISTING",
          location_id: locationId,
          agent_phone: agentPhone || null,
        },
      });
      toast.success("Settings saved");
      setApiKey("");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your integrations. Calls are placed through GoHighLevel — a real human (you) talks to the lead.
        </p>

        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Phone className="h-4 w-4" /> GoHighLevel
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Uses a Location API key. Find it in GHL under Settings → Business Info → API Keys.
              </p>
            </div>
            {data?.configured && (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                Connected
              </Badge>
            )}
          </div>

          {isLoading ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ghl-key">Location API key</Label>
                <Input
                  id="ghl-key"
                  type="password"
                  placeholder={data?.configured ? data.api_key_masked : "eyJhbGci..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                {data?.configured && (
                  <p className="text-xs text-muted-foreground">Leave blank to keep existing key.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ghl-loc">Location ID</Label>
                <Input
                  id="ghl-loc"
                  placeholder="e.g. abcdEFGH1234"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ghl-phone">Your phone (optional)</Label>
                <Input
                  id="ghl-phone"
                  placeholder="+15558675310"
                  value={agentPhone}
                  onChange={(e) => setAgentPhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Used as a reference. Set call forwarding on your GHL user so the dialer rings your phone.
                </p>
              </div>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
