ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS call_script text,
  ADD COLUMN IF NOT EXISTS drafts_updated_at timestamptz;