-- MAYUS — alinhamento da fundacao do runtime agêntico

-- 1. Kernel agêntico: fechar drift entre schema e runtime atual
ALTER TABLE public.agent_skills
  ADD COLUMN IF NOT EXISTS handler_type TEXT;

ALTER TABLE public.agent_audit_logs
  ADD COLUMN IF NOT EXISTS pending_execution_payload JSONB;

ALTER TABLE public.office_institutional_memory
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Registry de integrações: alinhar com a UI/server atuais
ALTER TABLE public.tenant_integrations
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE public.tenant_integrations
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.tenant_integrations
SET
  metadata = COALESCE(metadata, '{}'::jsonb),
  display_name = COALESCE(NULLIF(display_name, ''), provider)
WHERE metadata IS NULL OR display_name IS NULL OR display_name = '';

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant_provider
  ON public.tenant_integrations(tenant_id, provider);

-- 3. tenant_settings canônico para branding, ai_features e metas
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_features JSONB NOT NULL DEFAULT '{}'::jsonb,
  strategic_goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_settings_tenant_id_key UNIQUE (tenant_id)
);

INSERT INTO public.tenant_settings (tenant_id)
SELECT id
FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_id
  ON public.tenant_settings(tenant_id);

CREATE OR REPLACE FUNCTION public.handle_tenant_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS tr_tenant_settings_updated_at ON public.tenant_settings;
CREATE TRIGGER tr_tenant_settings_updated_at
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_tenant_settings_updated_at();

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view tenant_settings from their tenant" ON public.tenant_settings;
DROP POLICY IF EXISTS "Admins can insert tenant_settings for their tenant" ON public.tenant_settings;
DROP POLICY IF EXISTS "Admins can update tenant_settings for their tenant" ON public.tenant_settings;
DROP POLICY IF EXISTS "Admins can delete tenant_settings for their tenant" ON public.tenant_settings;

CREATE POLICY "Users can view tenant_settings from their tenant" ON public.tenant_settings
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can insert tenant_settings for their tenant" ON public.tenant_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT lower(coalesce(role, '')) FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'administrador', 'socio', 'sócio', 'mayus_admin')
  );

CREATE POLICY "Admins can update tenant_settings for their tenant" ON public.tenant_settings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT lower(coalesce(role, '')) FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'administrador', 'socio', 'sócio', 'mayus_admin')
  );

CREATE POLICY "Admins can delete tenant_settings for their tenant" ON public.tenant_settings
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT lower(coalesce(role, '')) FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'administrador', 'socio', 'sócio', 'mayus_admin')
  );
