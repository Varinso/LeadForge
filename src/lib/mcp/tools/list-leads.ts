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
  name: "list_leads",
  title: "List leads",
  description:
    "List leads in a campaign, optionally filtered by status. Returns business name, contact info, AI summary, lead score (0-100 with hot/warm/cool/cold tier) and email draft. Ranked best-fit first.",
  inputSchema: {
    campaign_id: z.string().uuid().describe("Campaign ID from list_campaigns."),
    status: z
      .enum(["new", "interested", "contacted", "not_a_fit"])
      .optional()
      .describe("Optional status filter."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ campaign_id, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("leads")
      .select(
        "id, name, phone, email, website, address, rating, review_count, category, ai_summary, outreach_hooks, email_subject, email_body, lead_score, score_tier, score_reasons, status, created_at",
      )
      .eq("campaign_id", campaign_id)
      .order("lead_score", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { leads: data ?? [] },
    };
  },
});
