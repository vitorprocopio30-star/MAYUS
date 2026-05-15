-- MAYUS security hardening: make tenant RLS resilient to incomplete JWT claims,
-- keep the agentic runtime writable by service_role, and force human approval
-- for billing actions that can charge clients.

CREATE OR REPLACE FUNCTION public.current_user_has_admin_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.is_superadmin = true
          OR public.get_current_user_role() IN ('admin', 'socio', 'mayus_admin')
        )
    ),
    false
  );
$$;

UPDATE public.profiles
SET role = CASE
  WHEN lower(trim(COALESCE(role, ''))) IN ('administrador', 'admin') THEN 'admin'
  WHEN lower(trim(COALESCE(role, ''))) IN ('socio', U&'s\00F3cio') THEN 'socio'
  WHEN lower(trim(COALESCE(role, ''))) IN ('advogado') THEN 'advogado'
  WHEN lower(trim(COALESCE(role, ''))) IN ('estagiario', U&'estagi\00E1rio') THEN 'estagiario'
  WHEN lower(trim(COALESCE(role, ''))) IN ('financeiro') THEN 'financeiro'
  WHEN lower(trim(COALESCE(role, ''))) IN ('sdr') THEN 'sdr'
  WHEN lower(trim(COALESCE(role, ''))) IN ('mayus_admin') THEN 'mayus_admin'
  ELSE lower(trim(COALESCE(role, '')))
END
WHERE role IS NOT NULL
  AND role IS DISTINCT FROM CASE
    WHEN lower(trim(COALESCE(role, ''))) IN ('administrador', 'admin') THEN 'admin'
    WHEN lower(trim(COALESCE(role, ''))) IN ('socio', U&'s\00F3cio') THEN 'socio'
    WHEN lower(trim(COALESCE(role, ''))) IN ('advogado') THEN 'advogado'
    WHEN lower(trim(COALESCE(role, ''))) IN ('estagiario', U&'estagi\00E1rio') THEN 'estagiario'
    WHEN lower(trim(COALESCE(role, ''))) IN ('financeiro') THEN 'financeiro'
    WHEN lower(trim(COALESCE(role, ''))) IN ('sdr') THEN 'sdr'
    WHEN lower(trim(COALESCE(role, ''))) IN ('mayus_admin') THEN 'mayus_admin'
    ELSE lower(trim(COALESCE(role, '')))
  END;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (
    role IN ('admin', 'socio', 'advogado', 'estagiario', 'financeiro', 'sdr', 'mayus_admin')
  );

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'process_pipelines',
    'process_tasks',
    'user_tasks',
    'process_document_memory',
    'process_documents',
    'process_document_contents',
    'process_draft_versions'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Tenant helper select ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_current_tenant_id())',
      'Tenant helper select ' || table_name,
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Tenant helper insert ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_current_tenant_id())',
      'Tenant helper insert ' || table_name,
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Tenant helper update ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.get_current_tenant_id()) WITH CHECK (tenant_id = public.get_current_tenant_id())',
      'Tenant helper update ' || table_name,
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Tenant helper delete ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.get_current_tenant_id())',
      'Tenant helper delete ' || table_name,
      table_name
    );
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'brain_tasks',
    'brain_runs',
    'brain_steps',
    'brain_artifacts',
    'brain_approvals',
    'brain_memories',
    'learning_events'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Tenant helper select ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_current_tenant_id())',
      'Tenant helper select ' || table_name,
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Tenant helper insert ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_current_tenant_id())',
      'Tenant helper insert ' || table_name,
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Tenant helper update ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.get_current_tenant_id()) WITH CHECK (tenant_id = public.get_current_tenant_id())',
      'Tenant helper update ' || table_name,
      table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Tenant helper select process_stages" ON public.process_stages;
CREATE POLICY "Tenant helper select process_stages" ON public.process_stages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.process_pipelines p
      WHERE p.id = process_stages.pipeline_id
        AND p.tenant_id = public.get_current_tenant_id()
    )
  );

DROP POLICY IF EXISTS "Tenant helper manage process_stages" ON public.process_stages;
CREATE POLICY "Tenant helper manage process_stages" ON public.process_stages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.process_pipelines p
      WHERE p.id = process_stages.pipeline_id
        AND p.tenant_id = public.get_current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.process_pipelines p
      WHERE p.id = process_stages.pipeline_id
        AND p.tenant_id = public.get_current_tenant_id()
    )
  );

DROP POLICY IF EXISTS "Tenant helper select system_event_logs" ON public.system_event_logs;
CREATE POLICY "Tenant helper select system_event_logs" ON public.system_event_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant helper select tenant_settings" ON public.tenant_settings;
CREATE POLICY "Tenant helper select tenant_settings" ON public.tenant_settings
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant helper insert tenant_settings admin" ON public.tenant_settings;
CREATE POLICY "Tenant helper insert tenant_settings admin" ON public.tenant_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  );

DROP POLICY IF EXISTS "Tenant helper update tenant_settings admin" ON public.tenant_settings;
CREATE POLICY "Tenant helper update tenant_settings admin" ON public.tenant_settings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  );

DROP POLICY IF EXISTS "Tenant helper delete tenant_settings admin" ON public.tenant_settings;
CREATE POLICY "Tenant helper delete tenant_settings admin" ON public.tenant_settings
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  );

DROP POLICY IF EXISTS "Tenant helper select instagram automations" ON public.instagram_automations;
CREATE POLICY "Tenant helper select instagram automations" ON public.instagram_automations
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant helper manage instagram automations admin" ON public.instagram_automations;
CREATE POLICY "Tenant helper manage instagram automations admin" ON public.instagram_automations
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  );

DROP POLICY IF EXISTS "Tenant helper select instagram webhook events" ON public.instagram_webhook_events;
CREATE POLICY "Tenant helper select instagram webhook events" ON public.instagram_webhook_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant helper select agent_skills" ON public.agent_skills;
CREATE POLICY "Tenant helper select agent_skills" ON public.agent_skills
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant helper insert agent_skills admin" ON public.agent_skills;
CREATE POLICY "Tenant helper insert agent_skills admin" ON public.agent_skills
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  );

DROP POLICY IF EXISTS "Tenant helper update agent_skills admin" ON public.agent_skills;
CREATE POLICY "Tenant helper update agent_skills admin" ON public.agent_skills
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  );

DROP POLICY IF EXISTS "Tenant helper select agent_audit_logs" ON public.agent_audit_logs;
CREATE POLICY "Tenant helper select agent_audit_logs" ON public.agent_audit_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant helper insert agent_audit_logs" ON public.agent_audit_logs;
CREATE POLICY "Tenant helper insert agent_audit_logs" ON public.agent_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant helper select office_institutional_memory" ON public.office_institutional_memory;
CREATE POLICY "Tenant helper select office_institutional_memory" ON public.office_institutional_memory
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant helper insert office_institutional_memory admin" ON public.office_institutional_memory;
CREATE POLICY "Tenant helper insert office_institutional_memory admin" ON public.office_institutional_memory
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.current_user_has_admin_access()
  );

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_skills',
    'agent_audit_logs',
    'office_institutional_memory',
    'brain_tasks',
    'brain_runs',
    'brain_steps',
    'brain_artifacts',
    'brain_approvals',
    'brain_memories',
    'learning_events',
    'system_event_logs'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role full access ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'service_role full access ' || table_name,
      table_name
    );
  END LOOP;
END $$;

UPDATE public.agent_skills
SET requires_human_confirmation = true,
    risk_level = 'high',
    allowed_roles = ARRAY['admin', 'socio', 'mayus_admin']::text[],
    updated_at = now()
WHERE name = 'asaas_cobrar'
   OR handler_type = 'asaas_cobrar';
