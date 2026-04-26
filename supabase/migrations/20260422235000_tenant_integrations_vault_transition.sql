DO $$
BEGIN
  IF to_regnamespace('vault') IS NULL THEN
    RAISE EXCEPTION 'Vault extension/schema is not available in this project.';
  END IF;
END;
$$;

ALTER TABLE public.tenant_integrations
  ADD COLUMN IF NOT EXISTS api_key_secret_id uuid,
  ADD COLUMN IF NOT EXISTS webhook_secret_secret_id uuid;

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_api_key_secret_id
  ON public.tenant_integrations(api_key_secret_id)
  WHERE api_key_secret_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_webhook_secret_secret_id
  ON public.tenant_integrations(webhook_secret_secret_id)
  WHERE webhook_secret_secret_id IS NOT NULL;

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
    (ti.api_key_secret_id IS NOT NULL OR COALESCE(NULLIF(btrim(ti.api_key), ''), '') <> '') AS has_api_key,
    (ti.webhook_secret_secret_id IS NOT NULL OR COALESCE(NULLIF(btrim(ti.webhook_secret), ''), '') <> '') AS has_webhook_secret
  FROM public.tenant_integrations ti
  WHERE ti.tenant_id = public.get_current_tenant_id()
  ORDER BY ti.provider;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_integration_resolved(
  p_tenant_id uuid,
  p_provider text
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  provider text,
  api_key text,
  webhook_secret text,
  webhook_url text,
  instance_name text,
  status text,
  metadata jsonb,
  display_name text,
  created_at timestamptz,
  updated_at timestamptz,
  api_key_secret_id uuid,
  webhook_secret_secret_id uuid
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
    COALESCE(api_secret.decrypted_secret, ti.api_key) AS api_key,
    COALESCE(webhook_secret.decrypted_secret, ti.webhook_secret) AS webhook_secret,
    ti.webhook_url,
    ti.instance_name,
    ti.status,
    COALESCE(ti.metadata, '{}'::jsonb) AS metadata,
    ti.display_name,
    ti.created_at,
    ti.updated_at,
    ti.api_key_secret_id,
    ti.webhook_secret_secret_id
  FROM public.tenant_integrations ti
  LEFT JOIN vault.decrypted_secrets api_secret
    ON api_secret.id = ti.api_key_secret_id
  LEFT JOIN vault.decrypted_secrets webhook_secret
    ON webhook_secret.id = ti.webhook_secret_secret_id
  WHERE ti.tenant_id = p_tenant_id
    AND ti.provider = p_provider
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_integrations_resolved(
  p_tenant_id uuid,
  p_providers text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  provider text,
  api_key text,
  webhook_secret text,
  webhook_url text,
  instance_name text,
  status text,
  metadata jsonb,
  display_name text,
  created_at timestamptz,
  updated_at timestamptz,
  api_key_secret_id uuid,
  webhook_secret_secret_id uuid
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
    COALESCE(api_secret.decrypted_secret, ti.api_key) AS api_key,
    COALESCE(webhook_secret.decrypted_secret, ti.webhook_secret) AS webhook_secret,
    ti.webhook_url,
    ti.instance_name,
    ti.status,
    COALESCE(ti.metadata, '{}'::jsonb) AS metadata,
    ti.display_name,
    ti.created_at,
    ti.updated_at,
    ti.api_key_secret_id,
    ti.webhook_secret_secret_id
  FROM public.tenant_integrations ti
  LEFT JOIN vault.decrypted_secrets api_secret
    ON api_secret.id = ti.api_key_secret_id
  LEFT JOIN vault.decrypted_secrets webhook_secret
    ON webhook_secret.id = ti.webhook_secret_secret_id
  WHERE ti.tenant_id = p_tenant_id
    AND (p_providers IS NULL OR ti.provider = ANY(p_providers))
  ORDER BY ti.provider;
$$;

CREATE OR REPLACE FUNCTION public.upsert_tenant_integration_secure(
  p_tenant_id uuid,
  p_provider text,
  p_api_key text DEFAULT NULL,
  p_webhook_secret text DEFAULT NULL,
  p_instance_name text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_webhook_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_clear_api_key boolean DEFAULT false,
  p_clear_webhook_secret boolean DEFAULT false
)
RETURNS public.tenant_integrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tenant_integrations;
  v_api_key_trimmed text;
  v_webhook_secret_trimmed text;
  v_api_key_secret_id uuid;
  v_webhook_secret_secret_id uuid;
BEGIN
  v_api_key_trimmed := NULLIF(btrim(COALESCE(p_api_key, '')), '');
  v_webhook_secret_trimmed := NULLIF(btrim(COALESCE(p_webhook_secret, '')), '');

  INSERT INTO public.tenant_integrations (
    tenant_id,
    provider,
    instance_name,
    status,
    display_name,
    webhook_url,
    metadata
  ) VALUES (
    p_tenant_id,
    p_provider,
    p_instance_name,
    p_status,
    p_display_name,
    p_webhook_url,
    p_metadata
  )
  ON CONFLICT (tenant_id, provider)
  DO UPDATE SET
    instance_name = COALESCE(EXCLUDED.instance_name, public.tenant_integrations.instance_name),
    status = COALESCE(EXCLUDED.status, public.tenant_integrations.status, 'disconnected'),
    display_name = COALESCE(EXCLUDED.display_name, public.tenant_integrations.display_name, p_provider),
    webhook_url = COALESCE(EXCLUDED.webhook_url, public.tenant_integrations.webhook_url),
    metadata = COALESCE(EXCLUDED.metadata, public.tenant_integrations.metadata, '{}'::jsonb),
    updated_at = now()
  RETURNING * INTO v_row;

  IF v_row.status IS NULL OR v_row.display_name IS NULL OR v_row.metadata IS NULL THEN
    UPDATE public.tenant_integrations
    SET status = COALESCE(v_row.status, 'disconnected'),
        display_name = COALESCE(v_row.display_name, p_provider),
        metadata = COALESCE(v_row.metadata, '{}'::jsonb),
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  IF p_clear_api_key THEN
    UPDATE public.tenant_integrations
    SET api_key = NULL,
        api_key_secret_id = NULL,
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSIF v_api_key_trimmed IS NOT NULL THEN
    IF v_row.api_key_secret_id IS NULL THEN
      v_api_key_secret_id := vault.create_secret(v_api_key_trimmed);
    ELSE
      PERFORM vault.update_secret(v_row.api_key_secret_id, v_api_key_trimmed);
      v_api_key_secret_id := v_row.api_key_secret_id;
    END IF;

    UPDATE public.tenant_integrations
    SET api_key = v_api_key_trimmed,
        api_key_secret_id = v_api_key_secret_id,
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  IF p_clear_webhook_secret THEN
    UPDATE public.tenant_integrations
    SET webhook_secret = NULL,
        webhook_secret_secret_id = NULL,
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSIF v_webhook_secret_trimmed IS NOT NULL THEN
    IF v_row.webhook_secret_secret_id IS NULL THEN
      v_webhook_secret_secret_id := vault.create_secret(v_webhook_secret_trimmed);
    ELSE
      PERFORM vault.update_secret(v_row.webhook_secret_secret_id, v_webhook_secret_trimmed);
      v_webhook_secret_secret_id := v_row.webhook_secret_secret_id;
    END IF;

    UPDATE public.tenant_integrations
    SET webhook_secret = v_webhook_secret_trimmed,
        webhook_secret_secret_id = v_webhook_secret_secret_id,
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_integration_resolved(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_tenant_integrations_resolved(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_tenant_integration_secure(uuid, text, text, text, text, text, text, text, jsonb, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_integration_resolved(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_tenant_integrations_resolved(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_integration_secure(uuid, text, text, text, text, text, text, text, jsonb, boolean, boolean) TO service_role;

DO $$
DECLARE
  integration_record record;
  created_secret_id uuid;
BEGIN
  FOR integration_record IN
    SELECT id, api_key
    FROM public.tenant_integrations
    WHERE api_key_secret_id IS NULL
      AND COALESCE(NULLIF(btrim(api_key), ''), '') <> ''
  LOOP
    created_secret_id := vault.create_secret(integration_record.api_key);
    UPDATE public.tenant_integrations
    SET api_key_secret_id = created_secret_id,
        updated_at = now()
    WHERE id = integration_record.id;
  END LOOP;

  FOR integration_record IN
    SELECT id, webhook_secret
    FROM public.tenant_integrations
    WHERE webhook_secret_secret_id IS NULL
      AND COALESCE(NULLIF(btrim(webhook_secret), ''), '') <> ''
  LOOP
    created_secret_id := vault.create_secret(integration_record.webhook_secret);
    UPDATE public.tenant_integrations
    SET webhook_secret_secret_id = created_secret_id,
        updated_at = now()
    WHERE id = integration_record.id;
  END LOOP;
END;
$$;
