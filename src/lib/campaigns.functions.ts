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
      .order("lead_score", { ascending: false, nullsFirst: false })
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
    const reasons = Array.isArray(lead.score_reasons) ? (lead.score_reasons as string[]) : [];

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
Lead score: ${lead.lead_score ?? "n/a"} (${lead.score_tier ?? "unscored"})
Qualification reasons (why they scored this way — reference the concrete gaps here):
${reasons.length ? reasons.map((r) => `- ${r}`).join("\n") : "- none available"}

Return:
- email_subject: short, specific, non-spammy (max 60 chars). No emojis, no ALL CAPS.
- email_body: 90-140 words plain text. Structure: specific personalized opener referencing something real about ${lead.name}, one sentence naming a concrete SEO/marketing gap drawn from the qualification reasons above, one sentence on the outcome you'd deliver, then a soft CTA asking for a 15-min call. Sign off as "[Your name]". Use \\n for line breaks. Friendly, direct, no fluff.`,
    });

    const { error: upErr } = await supabase
      .from("leads")
      .update({
        email_subject: output.email_subject,
        email_body: output.email_body,
        drafts_updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (upErr) throw new Error(upErr.message);
    return { email_subject: output.email_subject, email_body: output.email_body };
  });

/** Generate a personalized phone call script grounded in the lead's score reasons. */
export const generateLeadCallScript = createServerFn({ method: "POST" })
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
    const reasons = Array.isArray(lead.score_reasons) ? (lead.score_reasons as string[]) : [];

    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      output: Output.object({ schema: zod.object({ call_script: zod.string() }) }),
      prompt: `Write a cold call script for a rep at a ${campaign?.niche ?? "digital marketing"} / SEO agency calling this prospect.

Business: ${lead.name}
Website: ${lead.website ?? "n/a"}
Category: ${lead.category ?? "n/a"}
Location: ${campaign?.location ?? "n/a"}
Context: ${lead.ai_summary ?? "n/a"}
Lead score: ${lead.lead_score ?? "n/a"} (${lead.score_tier ?? "unscored"})
Qualification reasons (ground the pitch in these):
${reasons.length ? reasons.map((r) => `- ${r}`).join("\n") : "- none available"}

Return call_script as plain text (no markdown symbols) with these labelled sections, each on its own lines:
OPENER: 2 sentences, permission-based, names ${lead.name} and a real observation.
REASON FOR CALL: 1-2 sentences naming the concrete gap from the reasons above.
DISCOVERY QUESTIONS: 3 short questions.
OBJECTIONS: 3 lines in the form "If they say X -> respond Y" covering "we already have someone", "no budget", "send me an email".
CLOSE: 1-2 sentences booking a 15-minute call.
VOICEMAIL: 2 sentences under 20 seconds.
Conversational, no jargon, no fake compliments. Use \\n for line breaks.`,
    });

    const { error: upErr } = await supabase
      .from("leads")
      .update({ call_script: output.call_script, drafts_updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (upErr) throw new Error(upErr.message);
    return { call_script: output.call_script };
  });

/** Persist manually edited email / call-script drafts. */
export const saveLeadDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        email_subject: z.string().max(300).optional(),
        email_body: z.string().max(20000).optional(),
        call_script: z.string().max(20000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      drafts_updated_at: string;
      email_subject?: string;
      email_body?: string;
      call_script?: string;
    } = { drafts_updated_at: new Date().toISOString() };
    if (data.email_subject !== undefined) patch.email_subject = data.email_subject;
    if (data.email_body !== undefined) patch.email_body = data.email_body;
    if (data.call_script !== undefined) patch.call_script = data.call_script;
    const { error } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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

        let lead_score: number | null = null;
        let score_tier: string | null = null;
        let score_reasons: string[] | null = null;
        try {
          const { scoreBusiness } = await import("@/lib/scoring.server");
          const scored = await scoreBusiness({
            name: enriched.name,
            website: enriched.website,
            email: enriched.email,
            phone: enriched.phone,
            category: enriched.category ?? campaign.niche,
            rating: enriched.rating,
            review_count: enriched.review_count,
            about: enriched.about,
            ai_summary,
            niche: campaign.niche,
            location: campaign.location,
          });
          lead_score = scored.score;
          score_tier = scored.tier;
          score_reasons = scored.reasons;
        } catch (e) {
          console.error("scoring failed for", enriched.name, e);
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
          lead_score,
          score_tier,
          score_reasons,
          scored_at: lead_score === null ? null : new Date().toISOString(),
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


const ScoreInput = z.object({
  campaign_id: z.string().uuid(),
  rescore_all: z.boolean().default(false),
});

/** Score (or re-score) the leads in a campaign so they can be ranked. */
export const scoreCampaignLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, niche, location")
      .eq("id", data.campaign_id)
      .eq("user_id", userId)
      .single();
    if (!campaign) throw new Error("Campaign not found");

    let q = supabase
      .from("leads")
      .select("*")
      .eq("campaign_id", data.campaign_id)
      .eq("user_id", userId);
    if (!data.rescore_all) q = q.is("lead_score", null);
    const { data: leads, error } = await q.limit(60);
    if (error) throw new Error(error.message);

    const { scoreBusiness } = await import("@/lib/scoring.server");
    let scored = 0;
    for (const lead of leads ?? []) {
      try {
        const result = await scoreBusiness({
          name: lead.name,
          website: lead.website,
          email: lead.email,
          phone: lead.phone,
          category: lead.category,
          rating: lead.rating,
          review_count: lead.review_count,
          ai_summary: lead.ai_summary,
          niche: campaign.niche,
          location: campaign.location,
        });
        await supabase
          .from("leads")
          .update({
            lead_score: result.score,
            score_tier: result.tier,
            score_reasons: result.reasons,
            scored_at: new Date().toISOString(),
          })
          .eq("id", lead.id)
          .eq("user_id", userId);
        scored += 1;
      } catch (e) {
        console.error("score lead failed", lead.id, e);
      }
    }
    return { scored, total: (leads ?? []).length };
  });
