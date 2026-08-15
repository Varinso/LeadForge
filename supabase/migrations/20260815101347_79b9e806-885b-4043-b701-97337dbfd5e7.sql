ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_score integer,
  ADD COLUMN IF NOT EXISTS score_tier text,
  ADD COLUMN IF NOT EXISTS score_reasons jsonb,
  ADD COLUMN IF NOT EXISTS scored_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS leads_campaign_score_idx ON public.leads (campaign_id, lead_score DESC NULLS LAST);