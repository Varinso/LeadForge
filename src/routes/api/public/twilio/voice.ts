import { createFileRoute } from "@tanstack/react-router";

// TwiML endpoint Twilio fetches when the callee picks up.
// Returns <Response><Say>message</Say></Response>.
export const Route = createFileRoute("/api/public/twilio/voice")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

async function handler({ request }: { request: Request }) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const expected = process.env.TWILIO_WEBHOOK_SECRET ?? "";
  if (!expected || token !== expected) {
    return new Response("forbidden", { status: 403 });
  }
  const callId = url.searchParams.get("call") ?? "";
  let message = "Hello, this is an automated call. Goodbye.";
  if (callId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("calls")
      .select("message")
      .eq("id", callId)
      .maybeSingle();
    if (data?.message) message = data.message;
  }

  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escaped}</Say></Response>`;
  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
