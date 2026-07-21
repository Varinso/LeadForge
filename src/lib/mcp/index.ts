import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCampaignsTool from "./tools/list-campaigns";
import listLeadsTool from "./tools/list-leads";
import updateLeadStatusTool from "./tools/update-lead-status";
import createCampaignTool from "./tools/create-campaign";
import syncLeadToGhlTool from "./tools/sync-lead-to-ghl";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "leadforge-mcp",
  title: "LeadForge",
  version: "0.1.0",
  instructions:
    "Tools for LeadForge, a lead-gen workspace for marketing agencies. Use list_campaigns, list_leads, update_lead_status, create_campaign, and sync_lead_to_ghl (push a lead into the user's GoHighLevel location and return its contact URL so the caller can place a real human call from GHL).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listCampaignsTool,
    listLeadsTool,
    updateLeadStatusTool,
    createCampaignTool,
    syncLeadToGhlTool,
  ],
});
