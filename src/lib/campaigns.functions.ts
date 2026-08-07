import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateInput = z.object({
  name: z.string().min(1).max(120),
  niche: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  max_leads: z.number().int().min(5).max(50),
});

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({
        user_id: userId,
        name: data.name,
        niche: data.niche,
        location: data.location,
        max_leads: data.max_leads,
        status: "pending",
      })
      .select()
      .single();
    if (error || !campaign) throw new Error(error?.message ?? "Failed to create campaign");
    // Fire-and-forget scraping (don't await — the client polls campaign status)
    processCampaign({ data: { campaignId: campaign.id } }).catch((e) => {
      console.error("processCampaign failed", e);
    });
    return { id: campaign.id as string };
  });

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("campaigns")
      .select("*, leads(count)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !campaign) throw new Error(error?.message ?? "Not found");
    const { data: leads } = await supabase
      .from("leads")
      .select("*")
      .eq("campaign_id", data.id)
      .order("created_at", { ascending: false });
    return { campaign, leads: leads ?? [] };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign, error: findErr } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (findErr || !campaign) throw new Error("Campaign not found");

    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .eq("campaign_id", data.id)
      .eq("user_id", userId);
    const leadIds = (leads ?? []).map((l) => l.id);

    if (leadIds.length > 0) {
      await supabase.from("call_logs").delete().in("lead_id", leadIds).eq("user_id", userId);
      await supabase.from("email_sends").delete().in("lead_id", leadIds).eq("user_id", userId);
      await supabase
        .from("calendar_events")
        .delete()
        .in("lead_id", leadIds)
        .eq("user_id", userId);
      const { error: leadErr } = await supabase
        .from("leads")
        .delete()
        .in("id", leadIds)
        .eq("user_id", userId);
      if (leadErr) throw new Error(leadErr.message);
    }

    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "interested", "contacted", "not_a_fit"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("leads")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*, campaigns(niche, location)")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !lead) throw new Error(error?.message ?? "Lead not found");

    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) throw new Error("AI is not configured");

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText, Output } = await import("ai");
    const { z: zod } = await import("zod");
    const gateway = createLovableAiGatewayProvider(lovableKey);

    const campaign = (lead as unknown as { campaigns: { niche: string; location: string } }).campaigns;

    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      output: Output.object({
        schema: zod.object({ email_subject: zod.string(), email_body: zod.string() }),
      }),
      prompt: `Write a personalized cold email from a ${campaign?.niche ?? "digital marketing"} agency to a potential client.

Business: ${lead.name}
Website: ${lead.website ?? "n/a"}
Category: ${lead.category ?? "n/a"}
Location: ${campaign?.location ?? "n/a"}
Context: ${lead.ai_summary ?? "n/a"}

Return:
- email_subject: short, specific, non-spammy (max 60 chars). No emojis, no ALL CAPS.
- email_body: 90-140 words plain text. Structure: specific personalized opener referencing something real about ${lead.name}, one sentence naming a concrete SEO/marketing gap, one sentence on the outcome you'd deliver, then a soft CTA asking for a 15-min call. Sign off as "[Your name]". Use \\n for line breaks. Friendly, direct, no fluff.`,
    });

    const { error: upErr } = await supabase
      .from("leads")
      .update({ email_subject: output.email_subject, email_body: output.email_body })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (upErr) throw new Error(upErr.message);
    return { email_subject: output.email_subject, email_body: output.email_body };
  });


// Internal: background scrape+summarize. Uses service role to bypass RLS since
// this runs after fire-and-forget dispatch. Loaded lazily so client bundle stays clean.
const ProcessInput = z.object({ campaignId: z.string().uuid() });
export const processCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ProcessInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { searchBusinesses, enrichBusiness } = await import("@/lib/scrape.server");
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText, Output } = await import("ai");
    const { z: zod } = await import("zod");

    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .single();
    if (!campaign) return { ok: false };

    await supabaseAdmin
      .from("campaigns")
      .update({ status: "scraping" })
      .eq("id", data.campaignId);

    try {
      const businesses = await searchBusinesses(
        campaign.niche,
        campaign.location,
        campaign.max_leads,
      );

      const lovableKey = process.env.LOVABLE_API_KEY;
      const gateway = lovableKey ? createLovableAiGatewayProvider(lovableKey) : null;
      const SummarySchema = zod.object({
        summary: zod.string(),
        hooks: zod.array(zod.string()),
        email_subject: zod.string(),
        email_body: zod.string(),
      });

      for (const biz of businesses) {
        const enriched = await enrichBusiness(biz);

        let ai_summary: string | null = null;
        let outreach_hooks: string[] | null = null;
        let email_subject: string | null = null;
        let email_body: string | null = null;

        if (gateway) {
          try {
            const { output } = await generateText({
              model: gateway("google/gemini-3-flash-preview"),
              output: Output.object({ schema: SummarySchema }),
              prompt: `You are helping a ${campaign.niche} SEO/marketing agency evaluate and reach out to a potential client.

Business: ${enriched.name}
Website: ${enriched.website ?? "n/a"}
Location context: ${campaign.location}
Notes/about: ${enriched.about ?? "n/a"}

Return:
- summary: 3 concise sentences describing what they do, their likely digital-marketing pain points, and the SEO angle to pitch.
- hooks: 3 short (max 15 words each) personalized cold-outreach opening lines.
- email_subject: a short, specific, non-spammy subject line (max 60 chars). No emojis, no ALL CAPS, no "Re:".
- email_body: a personalized cold email (90-140 words) in plain text. Structure: a specific personalized opener referencing something real about ${enriched.name}, one sentence naming a concrete SEO/marketing gap you noticed, one sentence on the outcome you'd deliver, then a soft CTA asking for a 15-min call. Sign off as "[Your name]". Use \\n for line breaks. Friendly, direct, no fluff, no fake compliments.`,
            });
            ai_summary = output.summary;
            outreach_hooks = output.hooks;
            email_subject = output.email_subject;
            email_body = output.email_body;
          } catch (e) {
            console.error("AI summary failed for", enriched.name, e);
          }
        }

        await supabaseAdmin.from("leads").insert({
          campaign_id: campaign.id,
          user_id: campaign.user_id,
          name: enriched.name,
          phone: enriched.phone,
          email: enriched.email,
          website: enriched.website,
          address: enriched.address,
          rating: enriched.rating,
          review_count: enriched.review_count,
          category: enriched.category ?? campaign.niche,
          ai_summary,
          outreach_hooks,
          email_subject,
          email_body,
        });
      }


      await supabaseAdmin
        .from("campaigns")
        .update({ status: "completed" })
        .eq("id", data.campaignId);
    } catch (e) {
      console.error("processCampaign error", e);
      await supabaseAdmin
        .from("campaigns")
        .update({
          status: "failed",
          error_message: e instanceof Error ? e.message : String(e),
        })
        .eq("id", data.campaignId);
    }

    return { ok: true };
  });
