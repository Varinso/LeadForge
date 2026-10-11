import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getSmtpSettings, saveSmtpSettings } from "@/lib/email.functions";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";

export function SmtpSettingsCard() {
  const fetchS = useServerFn(getSmtpSettings);
  const save = useServerFn(saveSmtpSettings);
  const { data, refetch } = useQuery({ queryKey: ["smtp-settings"], queryFn: () => fetchS() });
  const [f, setF] = useState({ smtp_host: "smtp.gmail.com", smtp_port: "465", smtp_user: "", smtp_password: "", from_email: "", sender_name: "", reply_to: "", signature: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data)
      setF((p) => ({
        ...p,
        smtp_host: data.smtp_host ?? p.smtp_host,
        smtp_port: String(data.smtp_port ?? p.smtp_port),
        smtp_user: data.smtp_user ?? "",
        from_email: data.from_email ?? "",
        sender_name: data.sender_name ?? "",
        reply_to: data.reply_to ?? "",
        signature: data.signature ?? "",
      }));
  }, [data]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        data: {
          smtp_host: f.smtp_host,
          smtp_port: Number(f.smtp_port) || 465,
          smtp_user: f.smtp_user,
          smtp_password: f.smtp_password || undefined,
          from_email: f.from_email || f.smtp_user,
          sender_name: f.sender_name || null,
          reply_to: f.reply_to || null,
          signature: f.signature || null,
        },
      });
      toast.success("Email settings saved");
      setF((p) => ({ ...p, smtp_password: "" }));
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> Email sending</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            For Gmail: turn on 2-Step Verification, then create an App Password at myaccount.google.com/apppasswords.
          </p>
        </div>
        {data?.configured && <Badge>Connected</Badge>}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Mail server (SMTP host)</Label><Input value={f.smtp_host} onChange={set("smtp_host")} /></div>
        <div className="space-y-1.5"><Label>Port</Label><Input value={f.smtp_port} onChange={set("smtp_port")} placeholder="465 or 587" /></div>
        <div className="space-y-1.5"><Label>Email login</Label><Input value={f.smtp_user} onChange={set("smtp_user")} placeholder="you@gmail.com" /></div>
        <div className="space-y-1.5">
          <Label>App password</Label>
          <Input type="password" value={f.smtp_password} onChange={set("smtp_password")} placeholder={data?.configured ? "•••• saved — leave blank to keep" : "16-character app password"} />
        </div>
        <div className="space-y-1.5"><Label>From email</Label><Input value={f.from_email} onChange={set("from_email")} placeholder="Same as login" /></div>
        <div className="space-y-1.5"><Label>Sender name</Label><Input value={f.sender_name} onChange={set("sender_name")} placeholder="Jane from Acme SEO" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Reply-to (optional)</Label><Input value={f.reply_to} onChange={set("reply_to")} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Signature (optional)</Label><Textarea rows={3} value={f.signature} onChange={set("signature")} /></div>
      </div>
      <Button onClick={handleSave} disabled={saving} className="mt-4 gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save email settings
      </Button>
    </div>
  );
}
