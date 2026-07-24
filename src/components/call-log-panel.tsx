import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  logCall,
  listLeadCalls,
  deleteCall,
  createRecordingUploadUrl,
  DISPOSITIONS,
} from "@/lib/calls.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, Upload, PlayCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const DISPOSITION_LABELS: Record<(typeof DISPOSITIONS)[number], string> = {
  connected: "Connected",
  voicemail: "Voicemail",
  no_answer: "No answer",
  busy: "Busy",
  wrong_number: "Wrong number",
  not_interested: "Not interested",
  callback_requested: "Callback requested",
  booked: "Booked meeting",
};

const DISPOSITION_COLOR: Record<string, string> = {
  connected: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  booked: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  callback_requested: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  voicemail: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  no_answer: "bg-muted text-muted-foreground",
  busy: "bg-muted text-muted-foreground",
  wrong_number: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  not_interested: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

export function CallLogPanel({ leadId, campaignQueryKey }: { leadId: string; campaignQueryKey: unknown[] }) {
  const fetchCalls = useServerFn(listLeadCalls);
  const logCallFn = useServerFn(logCall);
  const deleteCallFn = useServerFn(deleteCall);
  const createUpload = useServerFn(createRecordingUploadUrl);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [disposition, setDisposition] = useState<(typeof DISPOSITIONS)[number]>("connected");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);


  const q = useQuery({
    queryKey: ["lead-calls", leadId],
    queryFn: () => fetchCalls({ data: { lead_id: leadId } }),
  });

  async function handleSave() {
    setSaving(true);
    try {
      let recording_url: string | null = null;
      if (file) {
        const signed = await createUpload({ data: { lead_id: leadId, filename: file.name } });
        const { error: upErr } = await supabase.storage
          .from("call-recordings")
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
        if (upErr) throw new Error(upErr.message);
        recording_url = signed.read_url;
      }
      const durNum = duration ? parseInt(duration, 10) : null;
      await logCallFn({
        data: {
          lead_id: leadId,
          disposition,
          duration_seconds: Number.isFinite(durNum as number) ? (durNum as number) : null,
          notes: notes || null,
          recording_url,
          follow_up_at: followUp ? new Date(followUp).toISOString() : null,
        },
      });
      toast.success("Call logged");
      setOpen(false);
      setDuration("");
      setNotes("");
      setFollowUp("");
      setFile(null);
      setDisposition("connected");
      qc.invalidateQueries({ queryKey: ["lead-calls", leadId] });
      qc.invalidateQueries({ queryKey: campaignQueryKey });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to log call");
    } finally {
      setSaving(false);
    }
  }


  async function handleDelete(id: string) {
    if (!confirm("Delete this call log?")) return;
    try {
      await deleteCallFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["lead-calls", leadId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const calls = q.data ?? [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Call log {calls.length > 0 && `(${calls.length})`}
        </h4>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} className="h-7 gap-1.5 text-xs">
          <Plus className="h-3 w-3" /> {open ? "Cancel" : "Log call"}
        </Button>
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded-md border border-border bg-muted/20 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={disposition} onValueChange={(v) => setDisposition(v as (typeof DISPOSITIONS)[number])}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPOSITIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DISPOSITION_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              placeholder="Duration (seconds)"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (what was said, next steps)…"
            rows={3}
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Follow-up</label>
            <Input
              type="datetime-local"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40">
            <Upload className="h-3.5 w-3.5" />
            {file ? file.name : "Upload recording (audio file, optional)"}
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button size="sm" onClick={handleSave} disabled={saving} className="w-full gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save call
          </Button>
        </div>
      )}

      {calls.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No calls logged yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {calls.map((c) => (
            <li key={c.id} className="rounded-md border border-border bg-card p-3 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      DISPOSITION_COLOR[c.disposition] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {DISPOSITION_LABELS[c.disposition as (typeof DISPOSITIONS)[number]] ?? c.disposition}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.called_at), { addSuffix: true })}
                    {c.duration_seconds != null && ` · ${formatDuration(c.duration_seconds)}`}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete call log"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {c.notes && <p className="whitespace-pre-wrap text-sm text-foreground/90">{c.notes}</p>}
              {c.recording_url && (
                <div className="mt-2 flex items-center gap-2">
                  <PlayCircle className="h-4 w-4 text-muted-foreground" />
                  <audio controls src={c.recording_url} className="h-8 w-full" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
