CREATE OR REPLACE FUNCTION public.list_my_tenant_integrations_safe()
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  provider text,
  status text,
  instance_name text,
  display_name text,
  webhook_url text,
  updated_at timestamptz,
  has_api_key boolean,
  has_webhook_secret boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ti.id,
    ti.tenant_id,
    ti.provider,
    ti.status,
    ti.instance_name,
    ti.display_name,
    ti.webhook_url,
    ti.updated_at,
    (COALESCE(NULLIF(btrim(ti.api_key), ''), '') <> '') AS has_api_key,
    (COALESCE(NULLIF(btrim(ti.webhook_secret), ''), '') <> '') AS has_webhook_secret
  FROM public.tenant_integrations ti
  WHERE ti.tenant_id = public.get_current_tenant_id()
  ORDER BY ti.provider;
$$;

REVOKE ALL ON FUNCTION public.list_my_tenant_integrations_safe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_tenant_integrations_safe() TO authenticated;

DROP POLICY IF EXISTS "Users can view their tenant" ON public.tenants;
CREATE POLICY "Users can view their tenant" ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.get_current_tenant_id());

DO $$
BEGIN
  IF to_regclass('public.prazos_processuais') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.prazos_processuais ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated can read prazos_processuais" ON public.prazos_processuais';
  EXECUTE 'DROP POLICY IF EXISTS "mayus_admin manages prazos_processuais" ON public.prazos_processuais';
  EXECUTE ''
    || 'CREATE POLICY "Authenticated can read prazos_processuais" ON public.prazos_processuais '
    || 'FOR SELECT TO authenticated USING (true)';
  EXECUTE ''
    || 'CREATE POLICY "mayus_admin manages prazos_processuais" ON public.prazos_processuais '
    || 'FOR ALL TO authenticated '
    || 'USING (public.get_current_user_role() = ''mayus_admin'') '
    || 'WITH CHECK (public.get_current_user_role() = ''mayus_admin'')';
END;
$$;
