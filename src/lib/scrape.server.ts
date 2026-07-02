// Firecrawl helpers — server-only. Uses REST v2 directly to avoid extra deps.
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

function apiKey() {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY not configured");
  return key;
}

export type ScrapedBusiness = {
  name: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  rating?: number;
  review_count?: number;
  category?: string;
  about?: string;
};

async function firecrawlSearch(query: string, limit: number) {
  const res = await fetch(`${FIRECRAWL_BASE}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit,
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl search failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    data?: { web?: Array<{ url: string; title?: string; description?: string; markdown?: string }> };
  };
  return json.data?.web ?? [];
}

async function firecrawlScrape(url: string) {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { markdown?: string; metadata?: { title?: string; description?: string; sourceURL?: string } };
  };
  return json.data ?? null;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE =
  /(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

function extractEmail(text: string): string | undefined {
  const matches = text.match(EMAIL_RE);
  if (!matches) return undefined;
  const filtered = matches.find(
    (m) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(m) && !m.includes("sentry") && !m.includes("wixpress"),
  );
  return filtered;
}

function extractPhone(text: string): string | undefined {
  const matches = text.match(PHONE_RE);
  return matches?.[0];
}

/**
 * Search for businesses via Firecrawl's web search (free tier friendly).
 * Uses general web queries + directory pages rather than scraping Google Maps directly.
 */
export async function searchBusinesses(
  niche: string,
  location: string,
  limit: number,
): Promise<ScrapedBusiness[]> {
  const query = `${niche} companies in ${location} contact phone email`;
  const results = await firecrawlSearch(query, Math.min(limit * 2, 20));

  const businesses: ScrapedBusiness[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (businesses.length >= limit) break;
    if (!r.url) continue;
    try {
      const host = new URL(r.url).hostname.replace(/^www\./, "");
      // Skip aggregator/directory hosts as primary — we want the business site
      if (
        [
          "yelp.com",
          "yellowpages.com",
          "bbb.org",
          "google.com",
          "facebook.com",
          "linkedin.com",
          "indeed.com",
          "mapquest.com",
          "wikipedia.org",
        ].some((d) => host.endsWith(d))
      ) {
        continue;
      }
      if (seen.has(host)) continue;
      seen.add(host);

      const searchSnippet = `${r.title ?? ""} ${r.description ?? ""} ${r.markdown ?? ""}`;
      businesses.push({
        name: r.title?.split("|")[0].split(" - ")[0].trim() || host,
        website: r.url,
        email: extractEmail(searchSnippet),
        phone: extractPhone(searchSnippet),
        about: r.description,
      });
    } catch {
      continue;
    }
  }

  return businesses;
}

/**
 * Enrich a business by scraping its homepage for missing contact info + about text.
 */
export async function enrichBusiness(biz: ScrapedBusiness): Promise<ScrapedBusiness> {
  if (!biz.website) return biz;
  if (biz.email && biz.phone && biz.about) return biz;
  const data = await firecrawlScrape(biz.website);
  if (!data?.markdown) return biz;
  const md = data.markdown;
  return {
    ...biz,
    email: biz.email ?? extractEmail(md),
    phone: biz.phone ?? extractPhone(md),
    about: biz.about ?? (data.metadata?.description || md.slice(0, 500)),
  };
}
