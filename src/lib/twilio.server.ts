// Twilio helper — routes through the Lovable connector gateway.
// Gateway auto-prefixes /2010-04-01/Accounts/{AccountSid}.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

export type CreateCallInput = {
  to: string;
  from: string;
  message: string;
  statusCallbackUrl: string;
  twimlUrl: string;
};

export type CreateCallResult = {
  sid: string;
  status: string;
  from: string;
  to: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export async function createTwilioCall(input: CreateCallInput): Promise<CreateCallResult> {
  const lovableKey = requireEnv("LOVABLE_API_KEY");
  const twilioKey = requireEnv("TWILIO_API_KEY");

  const body = new URLSearchParams({
    To: input.to,
    From: input.from,
    Url: input.twimlUrl,
    StatusCallback: input.statusCallbackUrl,
    StatusCallbackMethod: "POST",
  });
  // Twilio expects repeated StatusCallbackEvent params
  for (const evt of ["initiated", "ringing", "answered", "completed"]) {
    body.append("StatusCallbackEvent", evt);
  }

  const res = await fetch(`${GATEWAY_URL}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Twilio createCall failed [${res.status}]: ${text}`);
    throw new Error(`Twilio call failed [${res.status}]: ${text}`);
  }

  const data = (await res.json()) as {
    sid: string;
    status: string;
    from: string;
    to: string;
  };
  return { sid: data.sid, status: data.status, from: data.from, to: data.to };
}

export function publicAppUrl(): string {
  return requireEnv("PUBLIC_APP_URL").replace(/\/+$/, "");
}

export function webhookSecret(): string {
  return requireEnv("TWILIO_WEBHOOK_SECRET");
}
