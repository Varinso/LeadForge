// GoHighLevel v1 REST helpers (Location API key auth).
// Docs: https://public-api.gohighlevel.com/

const GHL_BASE = "https://rest.gohighlevel.com/v1";

export type GhlSettings = {
  api_key: string;
  location_id: string;
  agent_phone: string | null;
};

export type GhlContact = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
};

async function ghlFetch(apiKey: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GHL ${res.status}: ${text || res.statusText}`);
  }
  return text ? JSON.parse(text) : {};
}

export async function upsertGhlContact(
  settings: GhlSettings,
  lead: {
    name: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    tags?: string[];
  },
): Promise<GhlContact> {
  // v1 has an upsert-by-email/phone endpoint
  const body: Record<string, unknown> = {
    locationId: settings.location_id,
    name: lead.name,
    source: "LeadForge",
  };
  if (lead.email) body.email = lead.email;
  if (lead.phone) body.phone = lead.phone;
  if (lead.website) body.website = lead.website;
  if (lead.address) body.address1 = lead.address;
  if (lead.tags?.length) body.tags = lead.tags;

  const data = await ghlFetch(settings.api_key, `/contacts/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const contact = (data.contact ?? data) as GhlContact;
  if (!contact?.id) throw new Error("GHL did not return a contact id");
  return contact;
}

export function ghlContactUrl(locationId: string, contactId: string): string {
  // Opens the GHL contact detail — the built-in dialer bridges to the agent's phone.
  return `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`;
}
