import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importLeadsCsv } from "@/lib/email.functions";
import { SmtpSettingsCard } from "@/components/smtp-settings-card";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

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

function ImportPage() {
  const navigate = useNavigate();
  const doImport = useServerFn(importLeadsCsv);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

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
      toast.success(`Imported ${res.count} leads`);
      navigate({ to: "/campaigns/$id", params: { id: res.id } });
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
        </div>
        <SmtpSettingsCard />
      </div>
    </AppShell>
  );
}
