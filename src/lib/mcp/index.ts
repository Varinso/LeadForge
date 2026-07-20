import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCampaignsTool from "./tools/list-campaigns";
import listLeadsTool from "./tools/list-leads";
import updateLeadStatusTool from "./tools/update-lead-status";
import createCampaignTool from "./tools/create-campaign";
import createCallTool from "./tools/create-call";
import listCallsTool from "./tools/list-calls";

// OAuth issuer MUST be the direct Supabase host (not the .lovable.cloud proxy).
// Vite inlines VITE_SUPABASE_PROJECT_ID at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "leadforge-mcp",
  title: "LeadForge",
  version: "0.1.0",
  instructions:
    "Tools for LeadForge, a lead-generation workspace for marketing agencies. Use list_campaigns to see the user's campaigns, list_leads to inspect leads (with AI summaries and cold-email drafts), update_lead_status to move a lead through the pipeline, create_campaign to start a new niche+location scrape, create_call to place an outbound Twilio voice call to a lead, and list_calls to see call history and current status for a lead.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listCampaignsTool,
    listLeadsTool,
    updateLeadStatusTool,
    createCampaignTool,
    createCallTool,
    listCallsTool,
  ],
});
