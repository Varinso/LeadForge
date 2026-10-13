import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getSmtpSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_email_settings")
      .select("smtp_host, smtp_port, smtp_user, smtp_password, from_email, sender_name, signature, reply_to")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return null;
    const { smtp_password, ...rest } = data;
    return { ...rest, configured: !!(data.smtp_host && data.smtp_user && smtp_password) };
  });

export const saveSmtpSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        smtp_host: z.string().min(3).max(200),
        smtp_port: z.number().int().min(1).max(65535),
        smtp_user: z.string().min(3).max(200),
        smtp_password: z.string().max(500).optional(),
        from_email: z.string().email().max(255),
        sender_name: z.string().max(100).nullable().optional(),
        signature: z.string().max(2000).nullable().optional(),
        reply_to: z.string().max(255).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let password = data.smtp_password?.trim();
    if (!password) {
      const { data: ex } = await supabase
        .from("user_email_settings")
        .select("smtp_password")
        .eq("user_id", userId)
        .maybeSingle();
      password = ex?.smtp_password ?? undefined;
      if (!password) throw new Error("App password is required");
    }
    const { error } = await supabase.from("user_email_settings").upsert({
      user_id: userId,
      smtp_host: data.smtp_host.trim(),
      smtp_port: data.smtp_port,
      smtp_user: data.smtp_user.trim(),
      smtp_password: password.replace(/\s+/g, ""),
      from_email: data.from_email.trim(),
      sender_name: data.sender_name ?? null,
      signature: data.signature ?? null,
      reply_to: data.reply_to || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        lead_id: z.string().uuid(),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(20000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: s }, { data: lead }] = await Promise.all([
      supabase.from("user_email_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("leads").select("id, email").eq("id", data.lead_id).maybeSingle(),
    ]);
    if (!s?.smtp_host || !s.smtp_user || !s.smtp_password || !s.from_email)
      throw new Error("Set up your email in Settings first");
    if (!lead?.email) throw new Error("This lead has no email address");

    const text = s.signature ? `${data.body}\n\n${s.signature}` : data.body;
    const port = s.smtp_port ?? 465;
    let errorMessage: string | null = null;
    try {
      const { WorkerMailer } = await import("worker-mailer");
      await WorkerMailer.send(
        {
          host: s.smtp_host,
          port,
          secure: port === 465,
          startTls: port !== 465,
          credentials: { username: s.smtp_user, password: s.smtp_password },
          authType: "plain",
        },
        {
          from: { name: s.sender_name || undefined, email: s.from_email },
          to: lead.email,
          reply: s.reply_to || undefined,
          subject: data.subject,
          text,
        },
      );
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
    }

    await supabase.from("email_sends").insert({
      user_id: userId,
      lead_id: lead.id,
      to_email: lead.email,
      subject: data.subject,
      body: text,
      provider: "smtp",
      error_message: errorMessage,
    });
    if (errorMessage) throw new Error(`Send failed: ${errorMessage}`);
    await supabase.from("leads").update({ status: "contacted" }).eq("id", lead.id);
    return { ok: true };
  });

const CsvLead = z.object({
  name: z.string().min(1).max(300),
  email: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
});

export const importLeadsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        niche: z.string().max(200).optional(),
        location: z.string().max(200).optional(),
        leads: z.array(CsvLead).min(1).max(5000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: camp, error } = await supabase
      .from("campaigns")
      .insert({
        user_id: userId,
        name: data.name,
        niche: data.niche || "Imported",
        location: data.location || "CSV import",
        max_leads: data.leads.length,
        status: "completed",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const rows = data.leads.map((l) => ({
      user_id: userId,
      campaign_id: camp.id,
      name: l.name,
      email: l.email || null,
      phone: l.phone || null,
      website: l.website || null,
      address: l.address || null,
      category: l.category || null,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e } = await supabase.from("leads").insert(rows.slice(i, i + 500));
      if (e) throw new Error(e.message);
    }
    return { id: camp.id, count: rows.length };
  });

export const enrichCampaignEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ campaignId: z.string().uuid(), afterId: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { findEmailForWebsite } = await import("./scrape.server");
    let q = supabase
      .from("leads")
      .select("id, website")
      .eq("campaign_id", data.campaignId)
      .is("email", null)
      .not("website", "is", null)
      .order("id")
      .limit(5);
    if (data.afterId) q = q.gt("id", data.afterId);
    const { data: leads, error } = await q;
    if (error) throw new Error(error.message);
    let found = 0;
    await Promise.all(
      (leads ?? []).map(async (l) => {
        const email = await findEmailForWebsite(l.website!).catch(() => undefined);
        if (email) {
          found++;
          await supabase.from("leads").update({ email }).eq("id", l.id);
        }
      }),
    );
    const last = leads?.[leads.length - 1]?.id;
    return { processed: leads?.length ?? 0, found, lastId: last, done: (leads?.length ?? 0) < 5 };
  });
