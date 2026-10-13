import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importLeadsCsv, enrichCampaignEmails } from "@/lib/email.functions";
import { supabase } from "@/integrations/supabase/client";
import { SmtpSettingsCard } from "@/components/smtp-settings-card";
import { toast } from "sonner";
import { Loader2, Upload, Download, Mail } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/outreach")({
  head: () => ({ meta: [{ title: "Upload & Email — LeadForge" }] }),
  component: ImportPage,
});

type Row = { name: string; email?: string; phone?: string; website?: string; address?: string; category?: string };

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((v) => v.trim())) out.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((v) => v.trim())) out.push(row);
  return out;
}

const MAP: Record<keyof Row, string[]> = {
  name: ["first name", "opportunity name", "name", "company", "company name", "business", "business name", "title"],
  email: ["email address", "email", "email address", "e-mail", "mail"],
  phone: ["contact number", "phone", "phone number", "telephone", "mobile", "number"],
  website: ["miscellaneous (facebook/website)", "miscellaneous", "website", "url", "site", "web"],
  address: ["office address", "address", "location", "full address"],
  category: ["tag", "category", "industry", "niche", "type"],
};

function toRows(grid: string[][]): Row[] {
  const [head, ...body] = grid;
  if (!head) return [];
  const h = head.map((x) => x.replace(/\s+/g, " ").trim().toLowerCase());
  const cityI = h.indexOf("city"), stateI = h.indexOf("state");
  const idx = Object.fromEntries(
    Object.entries(MAP).map(([k, names]) => [k, h.findIndex((x) => names.includes(x))]),
  ) as Record<keyof Row, number>;
  if (idx.name < 0) throw new Error("CSV needs a 'First name' (business name) column");
  return body
    .map((r) => {
      const get = (k: keyof Row) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
      return { name: get("name"), email: get("email"), phone: get("phone"), website: get("website"), address: [get("address").startsWith("http") ? "" : get("address"), cityI >= 0 ? (r[cityI] ?? "").trim() : "", stateI >= 0 ? (r[stateI] ?? "").trim() : ""].filter(Boolean).join(", "), category: get("category") };
    })
    .filter((r) => r.name);
}

function extractColumns(emailText: string): string[] {
  // Find candidate lines: prefer lines containing commas, else use all non-empty lines
  const lines = emailText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const commaLines = lines.filter((l) => l.includes(","));
  const source = commaLines.length ? commaLines : lines;
  const cols: string[] = [];
  for (const line of source) {
    // Strip leading bullets / numbering like "- " or "1. "
    const cleaned = line.replace(/^[-*•\d.)\s]+/, "");
    for (const part of cleaned.split(",")) {
      const name = part.trim().replace(/^["']|["']$/g, "");
      if (name && !cols.some((c) => c.toLowerCase() === name.toLowerCase())) cols.push(name);
    }
  }
  return cols;
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function EmailToCsvCard() {
  const [emailText, setEmailText] = useState("");
  const [cols, setCols] = useState<string[]>([]);

  async function onEmailFile(f: File | undefined) {
    if (!f) return;
    setEmailText(await f.text());
  }

  function parse() {
    const c = extractColumns(emailText);
    if (!c.length) {
      toast.error("No column names found in the email text");
      return;
    }
    setCols(c);
    toast.success(`${c.length} columns found`);
  }

  function download() {
    if (!cols.length) return;
    const csv = cols.map(csvEscape).join(",") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "columns.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-8 space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium">Email → CSV headers</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Paste an email (or upload a .txt/.eml file) that lists the column names you want. We'll generate a CSV with those columns as the header row, in the same order.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="email-file">Email file (optional)</Label>
        <Input id="email-file" type="file" accept=".txt,.eml,text/plain" onChange={(e) => onEmailFile(e.target.files?.[0])} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email-text">Email content</Label>
        <Textarea
          id="email-text"
          rows={6}
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          placeholder={"Please create a CSV with the following columns:\nName, Email, SignupDate"}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={parse} disabled={!emailText.trim()}>
          Extract columns
        </Button>
        <Button onClick={download} disabled={!cols.length} className="gap-2">
          <Download className="h-4 w-4" /> Download CSV
        </Button>
      </div>
      {cols.length > 0 && (
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-2 text-xs text-muted-foreground">Header row preview:</p>
          <code className="block break-all text-sm">{cols.map(csvEscape).join(",")}</code>
        </div>
      )}
    </div>
  );
}

function ImportPage() {
  const navigate = useNavigate();
  const doImport = useServerFn(importLeadsCsv);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const enrich = useServerFn(enrichCampaignEmails);
  const [campId, setCampId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ processed: number; found: number; done: boolean } | null>(null);

  async function runEnrich(id: string) {
    let afterId: string | undefined, processed = 0, found = 0;
    setProgress({ processed, found, done: false });
    try {
      for (;;) {
        const r = await enrich({ data: { campaignId: id, afterId } });
        processed += r.processed; found += r.found;
        setProgress({ processed, found, done: r.done });
        if (r.done || !r.lastId) break;
        afterId = r.lastId;
      }
      toast.success(`Email search done: found ${found} of ${processed}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Email search failed");
      setProgress({ processed, found, done: true });
    }
  }

  async function downloadEnriched() {
    if (!campId) return;
    const { data, error } = await supabase.from("leads").select("name,email,phone,address,website,category").eq("campaign_id", campId).order("created_at");
    if (error) return toast.error(error.message);
    const head = ["#", "First name", "Email Address", "Facebook ID", "Contact Number", "Office Address", "City", "State", "Miscellaneous (Facebook/Website)", "Pipeline", "Opportunity name", "Tag"];
    const lines = (data ?? []).map((l, i) => {
      const parts = (l.address ?? "").split(",").map((x) => x.trim());
      const state = parts.length > 1 ? parts[parts.length - 1] : "";
      const city = parts.length > 1 ? parts[parts.length - 2] : "";
      return [String(i + 1), l.name, l.email ?? "", "", l.phone ?? "", l.address ?? "", city, state, l.website ?? "", "Marketing Pipeline", l.name, l.category ?? ""].map(csvEscape).join(",");
    });
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${name || "leads"}-enriched.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const r = toRows(parseCsv(await f.text()));
      setRows(r);
      if (!name) setName(f.name.replace(/\.csv$/i, ""));
      toast.success(`${r.length} leads found`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read CSV");
    }
  }

  async function submit() {
    if (!rows.length || !name) return;
    setLoading(true);
    try {
      const res = await doImport({ data: { name, leads: rows } });
      toast.success(`Imported ${res.count} leads — searching for missing emails…`);
      setCampId(res.id);
      void runEnrich(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Upload &amp; Email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Columns recognized: First name, Email Address, Contact Number, Office Address, City, State, Miscellaneous (Facebook/Website), Tag.
        </p>
        <div className="mt-8 space-y-5 rounded-xl border border-border bg-card p-6">
          <div className="space-y-1.5">
            <Label htmlFor="csv">CSV file</Label>
            <Input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cname">List name</Label>
            <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="My imported list" />
          </div>
          {rows.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr><th className="p-2">First name</th><th className="p-2">Email Address</th><th className="p-2">Contact Number</th><th className="p-2">Miscellaneous (Facebook/Website)</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2">{r.name}</td><td className="p-2">{r.email}</td><td className="p-2">{r.phone}</td><td className="p-2">{r.website}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && <p className="p-2 text-xs text-muted-foreground">…and {rows.length - 50} more</p>}
            </div>
          )}
          <Button onClick={submit} disabled={loading || !rows.length || !name} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import {rows.length || ""} leads
          </Button>
          {campId && progress && (
            <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4">
              <p className="flex items-center gap-2 text-sm">
                {!progress.done && <Loader2 className="h-4 w-4 animate-spin" />}
                {progress.done ? "Email search finished" : "Searching websites for emails…"} — checked {progress.processed}, found {progress.found}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={downloadEnriched} disabled={!progress.done} className="gap-2">
                  <Download className="h-4 w-4" /> Download enriched CSV
                </Button>
                <Button variant="outline" onClick={() => navigate({ to: "/campaigns/$id", params: { id: campId } })}>
                  Open campaign
                </Button>
              </div>
            </div>
          )}
        </div>
        <EmailToCsvCard />
        <SmtpSettingsCard />
      </div>
    </AppShell>
  );
}
