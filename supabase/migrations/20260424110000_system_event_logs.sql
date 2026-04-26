CREATE TABLE IF NOT EXISTS public.system_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  provider TEXT,
  event_name TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_event_logs_tenant_id
  ON public.system_event_logs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_system_event_logs_created_at
  ON public.system_event_logs(created_at DESC);

ALTER TABLE public.system_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select system_event_logs same tenant" ON public.system_event_logs;

CREATE POLICY "Select system_event_logs same tenant" ON public.system_event_logs
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
