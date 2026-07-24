import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const DISPOSITIONS = [
  "connected",
  "voicemail",
  "no_answer",
  "busy",
  "wrong_number",
  "not_interested",
  "callback_requested",
  "booked",
] as const;

const LogCallInput = z.object({
  lead_id: z.string().uuid(),
  disposition: z.enum(DISPOSITIONS),
  duration_seconds: z.number().int().min(0).max(60 * 60 * 4).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  recording_url: z.string().url().optional().nullable(),
  called_at: z.string().datetime().optional(),
  follow_up_at: z.string().datetime().optional().nullable(),
});


export const logCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LogCallInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .select("id")
      .eq("id", data.lead_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!lead) throw new Error("Lead not found");

    const { data: row, error } = await supabase
      .from("call_logs")
      .insert({
        user_id: userId,
        lead_id: data.lead_id,
        disposition: data.disposition,
        duration_seconds: data.duration_seconds ?? null,
        notes: data.notes ?? null,
        recording_url: data.recording_url ?? null,
        called_at: data.called_at ?? new Date().toISOString(),
        follow_up_at: data.follow_up_at ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);


    // Auto-advance lead status on productive dispositions.
    if (["connected", "booked", "callback_requested"].includes(data.disposition)) {
      await supabase
        .from("leads")
        .update({ status: "contacted" })
        .eq("id", data.lead_id)
        .eq("user_id", userId);
    }
    return row;
  });

export const listLeadCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ lead_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("call_logs")
      .select("id, called_at, disposition, duration_seconds, notes, recording_url, follow_up_at")
      .eq("user_id", userId)
      .eq("lead_id", data.lead_id)
      .order("called_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const CalendarRangeInput = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const listCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CalendarRangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [callsRes, followRes, repliesRes] = await Promise.all([
      supabase
        .from("call_logs")
        .select("id, lead_id, disposition, duration_seconds, notes, called_at")
        .eq("user_id", userId)
        .gte("called_at", data.from)
        .lte("called_at", data.to),
      supabase
        .from("call_logs")
        .select("id, lead_id, disposition, notes, follow_up_at")
        .eq("user_id", userId)
        .not("follow_up_at", "is", null)
        .gte("follow_up_at", data.from)
        .lte("follow_up_at", data.to),
      supabase
        .from("email_sends")
        .select("id, lead_id, subject, replied_at")
        .eq("user_id", userId)
        .not("replied_at", "is", null)
        .gte("replied_at", data.from)
        .lte("replied_at", data.to),
    ]);
    if (callsRes.error) throw new Error(callsRes.error.message);
    if (followRes.error) throw new Error(followRes.error.message);
    // email_sends may not exist in some deployments; tolerate its error silently.

    const leadIds = new Set<string>();
    (callsRes.data ?? []).forEach((r) => leadIds.add(r.lead_id));
    (followRes.data ?? []).forEach((r) => leadIds.add(r.lead_id));
    (repliesRes.data ?? []).forEach((r) => leadIds.add(r.lead_id));

    let leadMap: Record<string, { name: string; campaign_id: string; phone: string | null; email: string | null }> = {};
    if (leadIds.size > 0) {
      const { data: leadRows } = await supabase
        .from("leads")
        .select("id, name, campaign_id, phone, email")
        .in("id", Array.from(leadIds));
      leadMap = Object.fromEntries((leadRows ?? []).map((l) => [l.id, l]));
    }

    type Event = {
      id: string;
      kind: "call" | "follow_up" | "reply";
      at: string;
      lead_id: string;
      lead_name: string;
      campaign_id: string;
      title: string;
      detail: string | null;
    };
    const events: Event[] = [];
    for (const r of callsRes.data ?? []) {
      const lead = leadMap[r.lead_id];
      events.push({
        id: `call-${r.id}`,
        kind: "call",
        at: r.called_at,
        lead_id: r.lead_id,
        lead_name: lead?.name ?? "Unknown lead",
        campaign_id: lead?.campaign_id ?? "",
        title: r.disposition,
        detail: r.notes,
      });
    }
    for (const r of followRes.data ?? []) {
      const lead = leadMap[r.lead_id];
      events.push({
        id: `follow-${r.id}`,
        kind: "follow_up",
        at: r.follow_up_at as string,
        lead_id: r.lead_id,
        lead_name: lead?.name ?? "Unknown lead",
        campaign_id: lead?.campaign_id ?? "",
        title: "Callback",
        detail: r.notes,
      });
    }
    for (const r of repliesRes.data ?? []) {
      const lead = leadMap[r.lead_id];
      events.push({
        id: `reply-${r.id}`,
        kind: "reply",
        at: r.replied_at as string,
        lead_id: r.lead_id,
        lead_name: lead?.name ?? "Unknown lead",
        campaign_id: lead?.campaign_id ?? "",
        title: "Email reply",
        detail: r.subject,
      });
    }
    events.sort((a, b) => a.at.localeCompare(b.at));
    return events;
  });


export const deleteCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("call_logs")
      .select("recording_url")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    const { error } = await supabase
      .from("call_logs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    // Best-effort: remove uploaded recording file when it lives in our bucket.
    if (row?.recording_url) {
      const marker = "/object/sign/call-recordings/";
      const idx = row.recording_url.indexOf(marker);
      if (idx !== -1) {
        const path = row.recording_url.substring(idx + marker.length).split("?")[0];
        await supabase.storage.from("call-recordings").remove([path]);
      }
    }
    return { ok: true };
  });

export const createRecordingUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lead_id: z.string().uuid(),
        filename: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${data.lead_id}/${Date.now()}-${safeName}`;
    const { data: signed, error } = await supabase.storage
      .from("call-recordings")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Failed to create upload URL");

    const { data: readSigned, error: readErr } = await supabase.storage
      .from("call-recordings")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (readErr || !readSigned) throw new Error(readErr?.message ?? "Failed to sign read URL");

    return { path, upload_url: signed.signedUrl, token: signed.token, read_url: readSigned.signedUrl };
  });
