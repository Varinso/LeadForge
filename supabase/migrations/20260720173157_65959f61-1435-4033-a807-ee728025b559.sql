
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  twilio_call_sid text UNIQUE,
  direction text NOT NULL DEFAULT 'outbound',
  from_number text,
  to_number text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  duration_seconds integer,
  recording_url text,
  error_code text,
  error_message text,
  message text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX calls_lead_id_idx ON public.calls(lead_id);
CREATE INDEX calls_user_id_idx ON public.calls(user_id);
CREATE INDEX calls_twilio_sid_idx ON public.calls(twilio_call_sid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calls" ON public.calls
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER calls_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
