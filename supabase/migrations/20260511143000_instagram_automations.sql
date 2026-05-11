CREATE TABLE IF NOT EXISTS public.instagram_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  response_text text,
  direct_message text,
  file_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_automations_tenant_active
  ON public.instagram_automations(tenant_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_automations_tenant_keyword_unique
  ON public.instagram_automations(tenant_id, keyword);

ALTER TABLE public.instagram_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members read instagram automations" ON public.instagram_automations;
CREATE POLICY "Tenant members read instagram automations" ON public.instagram_automations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = instagram_automations.tenant_id
    )
  );

DROP POLICY IF EXISTS "Full access manages instagram automations" ON public.instagram_automations;
CREATE POLICY "Full access manages instagram automations" ON public.instagram_automations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = instagram_automations.tenant_id
        AND (p.role IN ('admin', 'Administrador', 'Sócio', 'Socio', 'mayus_admin') OR p.is_superadmin = true)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = instagram_automations.tenant_id
        AND (p.role IN ('admin', 'Administrador', 'Sócio', 'Socio', 'mayus_admin') OR p.is_superadmin = true)
    )
  );

CREATE TABLE IF NOT EXISTS public.instagram_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  instagram_business_id text,
  provider_event_id text NOT NULL,
  comment_id text,
  automation_id uuid REFERENCES public.instagram_automations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_webhook_events_provider_event_id
  ON public.instagram_webhook_events(provider_event_id);

CREATE INDEX IF NOT EXISTS idx_instagram_webhook_events_tenant_created
  ON public.instagram_webhook_events(tenant_id, created_at DESC);

ALTER TABLE public.instagram_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members read instagram webhook events" ON public.instagram_webhook_events;
CREATE POLICY "Tenant members read instagram webhook events" ON public.instagram_webhook_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = instagram_webhook_events.tenant_id
    )
  );
