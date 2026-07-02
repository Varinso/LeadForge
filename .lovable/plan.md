
# LeadForge v1 — Lead Scraping + AI Summaries

A multi-tenant SaaS where SEO/marketing agencies enter a niche + location (e.g. "fencing companies in Texas"), the app scrapes businesses from the web, generates an AI summary per lead, and saves everything into per-agency campaigns. Later phases will add cold email, voice calls, and tracking.

## What you get in v1

1. **Auth & multi-tenant workspace**
   - Email/password + Google sign-in
   - Each user has their own campaigns and leads (RLS-scoped)
   - Simple profile (name, agency name)

2. **New Campaign flow**
   - Form: campaign name, niche (e.g. "fencing"), location (e.g. "Austin, TX"), max leads (10–100)
   - On submit → background job scrapes and enriches

3. **Scraping (free, no paid API)**
   - Uses Firecrawl (free tier) to search + scrape Google Maps public results and business websites
   - Extracts: business name, address, phone, website, rating, review count, category
   - Enrichment pass: scrape each business's homepage for email + short "about" text

4. **AI summaries (Lovable AI Gateway — free tier)**
   - For each lead, generates a 3–4 sentence summary: what they do, likely pain points, SEO angle to pitch
   - Also generates 3 suggested outreach hooks (used later for cold email)

5. **Leads dashboard**
   - Table view of all leads in a campaign: name, phone, email, website, rating, AI summary
   - Filter/search, mark status (New / Interested / Contacted / Not a fit)
   - Export to CSV
   - Detail drawer with full summary + hooks

6. **Campaigns list page**
   - All campaigns with progress (scraped X/Y), created date, quick stats

## Design direction

Clean, professional B2B SaaS — think Linear/Attio. Dark sidebar navigation, light main area, generous whitespace. Data-dense tables done well (not cramped). Neutral palette with one accent color for CTAs. Inter for body, tight tracking on headings.

## Technical details

**Stack:** TanStack Start (already set up) + Lovable Cloud (Supabase) + Lovable AI Gateway + Firecrawl connector.

**Database (Lovable Cloud):**
- `profiles` (id → auth.users, full_name, agency_name)
- `campaigns` (id, user_id, name, niche, location, max_leads, status, created_at)
- `leads` (id, campaign_id, user_id, name, phone, email, website, address, rating, review_count, category, ai_summary, outreach_hooks jsonb, status, created_at)
- RLS: users only see their own rows via `auth.uid()`

**Scraping pipeline (server function):**
- `startCampaignScrape` server fn: creates campaign, kicks off async processing
- Uses Firecrawl `search` for `"{niche} {location} site:google.com/maps"` and Firecrawl `scrape` on results
- Fallback: Firecrawl search on general web + business directory pages
- Parses structured business data; inserts into `leads` table incrementally so UI can poll progress
- Note: heavy scraping runs inside the server function; for 100 leads this may take 1–2 minutes. UI shows live progress via polling `campaigns.status` and lead count.

**AI summaries:**
- After each lead is scraped, call `google/gemini-3-flash-preview` with lead data
- Structured output (Output.object) → `{ summary: string, hooks: string[] }`

**Connectors needed:**
- Firecrawl (free tier available — user connects with own free key)
- Lovable AI Gateway (built-in, free monthly allowance)

**Routes:**
- `/` — marketing landing
- `/auth` — sign-in/sign-up
- `/_authenticated/dashboard` — campaigns list
- `/_authenticated/campaigns/new` — new campaign form
- `/_authenticated/campaigns/$id` — leads table + detail

## Out of scope (later phases)

- Cold email generation & sending
- Voice calls & call tracking
- Email/reply tracking
- Team seats within a workspace
- Billing/plans

## Caveats to know

- **Google Maps ToS:** scraping Google Maps is against their ToS. Firecrawl handles this at their end, but for a real production business you'd eventually want the Google Places API (paid, has $200/mo free credit) — I can swap it in later.
- **Free tier limits:** Firecrawl free tier is ~500 scrapes/month, Lovable AI has a small free monthly allowance. Heavy usage will need upgrades.
- **Speed:** Scraping 100 leads in one request will be slow (~2 min). If you want faster/bigger campaigns later, we'd move to a proper background job queue.
