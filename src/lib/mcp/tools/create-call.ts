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
  name: "create_call",
  title: "Call a lead",
  description:
    "Place an outbound Twilio voice call to a lead's phone. Reads a short message when the lead answers and tracks status via webhook callbacks.",
  inputSchema: {
    lead_id: z.string().uuid().describe("Lead ID from list_leads."),
    message: z
      .string()
      .min(1)
      .max(1000)
      .describe("Text to speak to the lead when they answer. Keep it under 60 seconds spoken."),
    to_override: z
      .string()
      .optional()
      .describe("Optional E.164 override if the lead has no phone on file (e.g. +15558675310)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  handler: async ({ lead_id, message, to_override }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, name, phone, user_id")
      .eq("id", lead_id)
      .single();
    if (leadErr || !lead) {
      return { content: [{ type: "text", text: leadErr?.message ?? "Lead not found" }], isError: true };
    }
    const to = (to_override ?? lead.phone ?? "").trim();
    if (!to || !/^\+[1-9]\d{6,15}$/.test(to)) {
      return {
        content: [
          {
            type: "text",
            text: `No valid E.164 phone number for ${lead.name}. Pass to_override like +15558675310.`,
          },
        ],
        isError: true,
      };
    }

    const { createTwilioCall, publicAppUrl, webhookSecret } = await import(
      "@/lib/twilio.server"
    );
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!from) {
      return {
        content: [{ type: "text", text: "TWILIO_FROM_NUMBER is not configured" }],
        isError: true,
      };
    }

    const base = publicAppUrl();
    const secret = webhookSecret();

    // Insert pending call row first so the webhook has something to update.
    const { data: pending, error: insErr } = await supabase
      .from("calls")
      .insert({
        lead_id,
        user_id: userId,
        to_number: to,
        from_number: from,
        direction: "outbound",
        status: "queued",
        message,
      })
      .select()
      .single();
    if (insErr || !pending) {
      return { content: [{ type: "text", text: insErr?.message ?? "Failed to record call" }], isError: true };
    }

    try {
      const twimlUrl = `${base}/api/public/twilio/voice?token=${encodeURIComponent(secret)}&call=${pending.id}`;
      const statusUrl = `${base}/api/public/twilio/call-status?token=${encodeURIComponent(secret)}`;

      const result = await createTwilioCall({
        to,
        from,
        message,
        twimlUrl,
        statusCallbackUrl: statusUrl,
      });

      await supabase
        .from("calls")
        .update({ twilio_call_sid: result.sid, status: result.status })
        .eq("id", pending.id);

      return {
        content: [
          {
            type: "text",
            text: `Call initiated to ${lead.name} (${to}). Twilio SID ${result.sid}, status ${result.status}.`,
          },
        ],
        structuredContent: { call_id: pending.id, twilio_sid: result.sid, status: result.status },
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("calls")
        .update({ status: "failed", error_message: errMsg })
        .eq("id", pending.id);
      return { content: [{ type: "text", text: errMsg }], isError: true };
    }
  },
});
