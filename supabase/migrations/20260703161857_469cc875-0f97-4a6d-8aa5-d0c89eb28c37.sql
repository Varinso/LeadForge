
-- User email settings (one row per user)
CREATE TABLE public.user_email_settings (
  user_id uuid NOT NULL PRIMARY KEY,
  sender_name text,
  signature text,
  reply_to text,
  gmail_email text,
  gmail_access_token text,
  gmail_refresh_token text,
  gmail_token_expires_at timestamptz,
  gmail_last_history_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_email_settings TO authenticated;
GRANT ALL ON public.user_email_settings TO service_role;

ALTER TABLE public.user_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email settings"
  ON public.user_email_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_email_settings_updated_at
  BEFORE UPDATE ON public.user_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sent emails with tracking
CREATE TABLE public.email_sends (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  replied_at timestamptz,
  reply_snippet text,
  gmail_message_id text,
  gmail_thread_id text,
  provider text NOT NULL DEFAULT 'gmail',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_sends_lead_id_idx ON public.email_sends(lead_id);
CREATE INDEX email_sends_user_id_idx ON public.email_sends(user_id);
CREATE INDEX email_sends_gmail_thread_idx ON public.email_sends(gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sends TO authenticated;
GRANT ALL ON public.email_sends TO service_role;

ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email sends"
  ON public.email_sends
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
