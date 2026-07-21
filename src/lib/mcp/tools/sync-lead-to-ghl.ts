import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "sync_lead_to_ghl",
  title: "Send lead to GoHighLevel",
  description:
    "Upsert a lead as a contact in the user's GoHighLevel location and return the GHL contact URL. Open that URL to place a real human call using GHL's dialer (no AI voice).",
  inputSchema: {
    lead_id: z.string().uuid().describe("Lead ID from list_leads."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  handler: async ({ lead_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const { data: settings } = await supabase
      .from("user_ghl_settings")
      .select("api_key, location_id, agent_phone")
      .eq("user_id", userId)
      .maybeSingle();
    if (!settings) {
      return {
        content: [{ type: "text", text: "GoHighLevel is not configured. Add your API key in Settings." }],
        isError: true,
      };
    }

    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .select("id, name, email, phone, website, address, campaigns(niche, location)")
      .eq("id", lead_id)
      .single();
    if (lErr || !lead) {
      return { content: [{ type: "text", text: lErr?.message ?? "Lead not found" }], isError: true };
    }

    const campaign = (lead as unknown as { campaigns: { niche: string; location: string } | null }).campaigns;
    const tags = ["LeadForge"];
    if (campaign?.niche) tags.push(campaign.niche);
    if (campaign?.location) tags.push(campaign.location);

    try {
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
      return {
        content: [
          { type: "text", text: `Synced ${lead.name} to GHL. Open ${url} and click Call to bridge the call to your phone.` },
        ],
        structuredContent: { contact_id: contact.id, contact_url: url },
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
        isError: true,
      };
    }
  },
});
