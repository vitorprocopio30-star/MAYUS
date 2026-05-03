CREATE TABLE IF NOT EXISTS public.admin_support_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL,
  scope text[] NOT NULL DEFAULT ARRAY['setup_diagnostics']::text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_support_grants_tenant_status
  ON public.admin_support_grants(tenant_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_support_grants_requested_by
  ON public.admin_support_grants(requested_by, created_at DESC);

ALTER TABLE public.admin_support_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages admin support grants" ON public.admin_support_grants;

CREATE POLICY "Service role manages admin support grants" ON public.admin_support_grants
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

