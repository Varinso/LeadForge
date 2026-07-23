import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCampaign, updateLeadStatus, generateLeadEmail } from "@/lib/campaigns.functions";
import { syncLeadToGhl } from "@/lib/ghl.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Download, Loader2, Mail, Phone, ExternalLink, Search, Copy, Sparkles, Send, PhoneCall } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  component: CampaignDetail,
});

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  category: string | null;
  ai_summary: string | null;
  outreach_hooks: string[] | null;
  email_subject: string | null;
  email_body: string | null;
  status: string;
  ghl_contact_id: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  interested: "Interested",
  contacted: "Contacted",
  not_a_fit: "Not a fit",
};

function statusVariant(s: string) {
  switch (s) {
    case "interested":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "contacted":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "not_a_fit":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  }
}

function CampaignDetail() {
  const { id } = Route.useParams();
  const fetchCampaign = useServerFn(getCampaign);
  const updateStatus = useServerFn(updateLeadStatus);
  const genEmail = useServerFn(generateLeadEmail);
  const pushToGhl = useServerFn(syncLeadToGhl);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [callLoading, setCallLoading] = useState(false);

  useEffect(() => {
    setEmailSubject(selected?.email_subject ?? "");
    setEmailBody(selected?.email_body ?? "");
  }, [selected]);

  async function handleGenerate() {
    if (!selected) return;
    setGenerating(true);
    try {
      const res = await genEmail({ data: { id: selected.id } });
      setEmailSubject(res.email_subject);
      setEmailBody(res.email_body);
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      toast.success("Email draft generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate email");
    } finally {
      setGenerating(false);
    }
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${emailBody}`);
    toast.success("Copied to clipboard");
  }

  async function handleCallViaGhl() {
    if (!selected) return;
    setCallLoading(true);
    try {
      const res = await pushToGhl({ data: { lead_id: selected.id } });
      window.open(res.contact_url, "_blank", "noopener,noreferrer");
      toast.success("Opened in GoHighLevel — click Call to bridge to your phone");
      qc.invalidateQueries({ queryKey: ["campaign", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to sync to GHL");
    } finally {
      setCallLoading(false);
    }
  }


  const query = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => fetchCampaign({ data: { id } }),
    refetchInterval: (q) => {
      const status = (q.state.data as { campaign: { status: string } } | undefined)?.campaign.status;
      return status === "pending" || status === "scraping" ? 3000 : false;
    },
  });

  const filtered = useMemo(() => {
    const leads = (query.data?.leads ?? []) as Lead[];
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          l.name.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.website?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [query.data, search, statusFilter]);

  async function changeStatus(lead: Lead, status: string) {
    try {
      await updateStatus({ data: { id: lead.id, status: status as never } });
      qc.invalidateQueries({ queryKey: ["campaign", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  function exportCsv() {
    const leads = (query.data?.leads ?? []) as Lead[];
    const rows = [
      ["Name", "Phone", "Email", "Website", "Status", "AI Summary"],
      ...leads.map((l) => [
        l.name,
        l.phone ?? "",
        l.email ?? "",
        l.website ?? "",
        l.status,
        l.ai_summary ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${query.data?.campaign.name ?? "leads"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const campaign = query.data?.campaign;
  const isScraping = campaign?.status === "pending" || campaign?.status === "scraping";

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-8">
        <Link
          to="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to campaigns
        </Link>

        {campaign && (
          <div className="mb-6 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
                {isScraping && (
                  <Badge className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Scraping
                  </Badge>
                )}
                {campaign.status === "failed" && (
                  <Badge variant="destructive">Failed</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {campaign.niche} · {campaign.location} · {filtered.length} of {campaign.max_leads} leads
              </p>
              {campaign.error_message && (
                <p className="mt-2 text-sm text-destructive">{campaign.error_message}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        )}

        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search leads…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">AI Summary</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{lead.name}</div>
                    {lead.website && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <ExternalLink className="h-3 w-3" />
                        <span className="truncate">{new URL(lead.website).hostname.replace(/^www\./, "")}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1 text-xs">
                      {lead.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</div>}
                      {lead.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</div>}
                      {!lead.email && !lead.phone && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <p className="line-clamp-2 text-muted-foreground">
                      {lead.ai_summary ?? <span className="italic">Generating…</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Select value={lead.status} onValueChange={(v) => changeStatus(lead, v)}>
                      <SelectTrigger className={`h-8 w-32 ${statusVariant(lead.status)} border-0`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center text-muted-foreground">
                    {isScraping ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Scraping leads… they'll appear here as they're found.</span>
                      </div>
                    ) : (
                      "No leads match your filters."
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-4xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>{selected.category}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6 px-4 pb-8">
                <div className="space-y-2">
                  {selected.website && (
                    <a
                      href={selected.website}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" /> {selected.website}
                    </a>
                  )}
                  {selected.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" /> {selected.email}
                    </div>
                  )}
                  {selected.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" /> {selected.phone}
                    </div>
                  )}
                </div>

                {selected.phone && (
                  <Button
                    onClick={handleCallViaGhl}
                    disabled={callLoading}
                    className="w-full gap-2"
                  >
                    {callLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                    {selected.ghl_contact_id ? "Open in GoHighLevel & call" : "Send to GoHighLevel & call"}
                  </Button>
                )}

                {selected.ai_summary && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      AI Summary
                    </h4>
                    <p className="text-sm leading-relaxed">{selected.ai_summary}</p>
                  </div>
                )}

                {selected.outreach_hooks && selected.outreach_hooks.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Cold outreach hooks
                    </h4>
                    <ul className="space-y-2">
                      {selected.outreach_hooks.map((h, i) => (
                        <li key={i} className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Cold email draft
                    </h4>
                    <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={generating} className="h-7 gap-1.5 text-xs">
                      {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {emailBody ? "Regenerate" : "Generate"}
                    </Button>
                  </div>
                  {emailBody || emailSubject ? (
                    <div className="space-y-2">
                      <Input
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="Subject line"
                        className="text-sm"
                      />
                      <Textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        rows={10}
                        className="text-sm leading-relaxed"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={copyEmail} className="gap-1.5">
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </Button>
                        {selected.email && (
                          <Button size="sm" asChild className="gap-1.5">
                            <a
                              href={`mailto:${selected.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                            >
                              <Send className="h-3.5 w-3.5" /> Open in mail
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      {generating ? "Generating personalized draft…" : "No draft yet. Click Generate to create one."}
                    </p>
                  )}
                </div>
              </div>
            </>

          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
