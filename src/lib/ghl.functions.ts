import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SettingsInput = z.object({
  api_key: z.string().min(10),
  location_id: z.string().min(3),
  agent_phone: z.string().optional().nullable(),
});

export const getGhlSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("user_ghl_settings")
      .select("api_key, location_id, agent_phone")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    // Mask the API key when returning to the client.
    return {
      api_key_masked: data.api_key ? `••••${data.api_key.slice(-4)}` : "",
      location_id: data.location_id,
      agent_phone: data.agent_phone,
      configured: true,
    };
  });

export const saveGhlSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("user_ghl_settings").upsert({
      user_id: userId,
      api_key: data.api_key,
      location_id: data.location_id,
      agent_phone: data.agent_phone ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncLeadToGhl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ lead_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings, error: sErr } = await supabase
      .from("user_ghl_settings")
      .select("api_key, location_id, agent_phone")
      .eq("user_id", userId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!settings) {
      throw new Error("GoHighLevel is not configured. Add your API key in Settings.");
    }

    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .select("id, name, email, phone, website, address, campaigns(niche, location)")
      .eq("id", data.lead_id)
      .eq("user_id", userId)
      .single();
    if (lErr || !lead) throw new Error(lErr?.message ?? "Lead not found");

    const campaign = (lead as unknown as { campaigns: { niche: string; location: string } | null }).campaigns;
    const tags = ["LeadForge"];
    if (campaign?.niche) tags.push(campaign.niche);
    if (campaign?.location) tags.push(campaign.location);

    const { upsertGhlContact, ghlContactUrl } = await import("@/lib/ghl.server");
    const contact = await upsertGhlContact(
      { api_key: settings.api_key, location_id: settings.location_id, agent_phone: settings.agent_phone },
      {
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        website: lead.website,
        address: lead.address,
        tags,
      },
    );

    const url = ghlContactUrl(settings.location_id, contact.id);
    await supabase
      .from("leads")
      .update({ ghl_contact_id: contact.id, ghl_synced_at: new Date().toISOString() })
      .eq("id", lead.id);

    return { contact_id: contact.id, contact_url: url };
  });
