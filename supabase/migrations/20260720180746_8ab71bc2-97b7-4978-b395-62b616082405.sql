CREATE TABLE IF NOT EXISTS public.user_ghl_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  location_id TEXT NOT NULL,
  agent_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ghl_settings TO authenticated;
GRANT ALL ON public.user_ghl_settings TO service_role;
ALTER TABLE public.user_ghl_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own ghl settings" ON public.user_ghl_settings;
CREATE POLICY "own ghl settings" ON public.user_ghl_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_user_ghl_settings_updated ON public.user_ghl_settings;
CREATE TRIGGER trg_user_ghl_settings_updated
  BEFORE UPDATE ON public.user_ghl_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_synced_at TIMESTAMPTZ;

DROP TABLE IF EXISTS public.calls;