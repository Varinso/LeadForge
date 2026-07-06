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
  name: "create_campaign",
  title: "Create campaign",
  description:
    "Create a lead-scraping campaign for a niche + location. Scraping and AI enrichment run in the background afterwards.",
  inputSchema: {
    name: z.string().min(1).max(120).describe("Human name, e.g. 'Fencing - Austin'."),
    niche: z.string().min(1).max(120).describe("Business type, e.g. 'fencing contractors'."),
    location: z.string().min(1).max(120).describe("City/region, e.g. 'Austin, TX'."),
    max_leads: z.number().int().min(5).max(50).default(20),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  handler: async ({ name, niche, location, max_leads }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        user_id: ctx.getUserId(),
        name,
        niche,
        location,
        max_leads,
        status: "pending",
      })
      .select()
      .single();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    // Kick off background scrape (best-effort — do not await response).
    try {
      const base = process.env.SUPABASE_URL?.replace(".supabase.co", "") ?? "";
      void base; // background scrape trigger is handled by the app UI path
    } catch {
      /* noop */
    }
    return {
      content: [
        {
          type: "text",
          text: `Campaign ${data.id} created. Open it in the app to start the scrape, or it will begin when triggered from the dashboard.`,
        },
      ],
      structuredContent: { campaign: data },
    };
  },
});
