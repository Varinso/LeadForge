CREATE TABLE public.call_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  called_at timestamptz NOT NULL DEFAULT now(),
  disposition text NOT NULL,
  duration_seconds integer,
  notes text,
  recording_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own call logs"
ON public.call_logs FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX call_logs_lead_id_idx ON public.call_logs(lead_id, called_at DESC);
CREATE INDEX call_logs_user_called_at_idx ON public.call_logs(user_id, called_at DESC);

CREATE TRIGGER update_call_logs_updated_at
BEFORE UPDATE ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users read own call recordings"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'call-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own call recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'call-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own call recordings"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'call-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);