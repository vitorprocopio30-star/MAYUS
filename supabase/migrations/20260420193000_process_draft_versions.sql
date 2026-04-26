CREATE TABLE IF NOT EXISTS public.process_draft_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  process_task_id uuid NOT NULL REFERENCES public.process_tasks(id) ON DELETE CASCADE,
  source_artifact_id uuid REFERENCES public.brain_artifacts(id) ON DELETE SET NULL,
  source_task_id uuid REFERENCES public.brain_tasks(id) ON DELETE SET NULL,
  source_case_brain_task_id uuid REFERENCES public.brain_tasks(id) ON DELETE SET NULL,
  parent_version_id uuid REFERENCES public.process_draft_versions(id) ON DELETE SET NULL,
  version_number integer NOT NULL,
  workflow_status text NOT NULL DEFAULT 'draft',
  is_current boolean NOT NULL DEFAULT true,
  piece_type text,
  piece_label text,
  practice_area text,
  summary text,
  draft_markdown text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_draft_versions_process_version_unique UNIQUE (process_task_id, version_number),
  CONSTRAINT process_draft_versions_status_check CHECK (workflow_status IN ('draft', 'approved', 'published'))
);

ALTER TABLE public.process_draft_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view process draft versions from their tenant" ON public.process_draft_versions;
DROP POLICY IF EXISTS "Users can insert process draft versions from their tenant" ON public.process_draft_versions;
DROP POLICY IF EXISTS "Users can update process draft versions from their tenant" ON public.process_draft_versions;
DROP POLICY IF EXISTS "Users can delete process draft versions from their tenant" ON public.process_draft_versions;

CREATE POLICY "Users can view process draft versions from their tenant" ON public.process_draft_versions
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert process draft versions from their tenant" ON public.process_draft_versions
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update process draft versions from their tenant" ON public.process_draft_versions
  FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete process draft versions from their tenant" ON public.process_draft_versions
  FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_process_draft_versions_process_task_id
  ON public.process_draft_versions(process_task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_process_draft_versions_current
  ON public.process_draft_versions(tenant_id, process_task_id, is_current)
  WHERE is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_process_draft_versions_one_current
  ON public.process_draft_versions(process_task_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_process_draft_versions_status
  ON public.process_draft_versions(tenant_id, workflow_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_process_draft_versions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_process_draft_versions_updated_at ON public.process_draft_versions;
CREATE TRIGGER tr_process_draft_versions_updated_at
  BEFORE UPDATE ON public.process_draft_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_process_draft_versions_updated_at();

DROP FUNCTION IF EXISTS public.create_process_draft_version_atomic(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, uuid);
CREATE OR REPLACE FUNCTION public.create_process_draft_version_atomic(
  p_tenant_id uuid,
  p_process_task_id uuid,
  p_source_artifact_id uuid DEFAULT NULL,
  p_source_task_id uuid DEFAULT NULL,
  p_source_case_brain_task_id uuid DEFAULT NULL,
  p_piece_type text DEFAULT NULL,
  p_piece_label text DEFAULT NULL,
  p_practice_area text DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_draft_markdown text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_created_by uuid DEFAULT NULL
) RETURNS SETOF public.process_draft_versions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_parent_version_id uuid;
  v_latest_version_number integer;
  v_inserted public.process_draft_versions%ROWTYPE;
BEGIN
  IF p_draft_markdown IS NULL OR btrim(p_draft_markdown) = '' THEN
    RAISE EXCEPTION 'Nao foi possivel registrar a versao da minuta sem conteudo.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_process_task_id::text));

  SELECT id, version_number
  INTO v_parent_version_id, v_latest_version_number
  FROM public.process_draft_versions
  WHERE tenant_id = p_tenant_id
    AND process_task_id = p_process_task_id
  ORDER BY version_number DESC
  LIMIT 1;

  UPDATE public.process_draft_versions
  SET is_current = false
  WHERE tenant_id = p_tenant_id
    AND process_task_id = p_process_task_id
    AND is_current = true;

  INSERT INTO public.process_draft_versions (
    tenant_id,
    process_task_id,
    source_artifact_id,
    source_task_id,
    source_case_brain_task_id,
    parent_version_id,
    version_number,
    workflow_status,
    is_current,
    piece_type,
    piece_label,
    practice_area,
    summary,
    draft_markdown,
    metadata,
    created_by
  ) VALUES (
    p_tenant_id,
    p_process_task_id,
    p_source_artifact_id,
    p_source_task_id,
    p_source_case_brain_task_id,
    v_parent_version_id,
    COALESCE(v_latest_version_number, 0) + 1,
    'draft',
    true,
    p_piece_type,
    p_piece_label,
    p_practice_area,
    p_summary,
    p_draft_markdown,
    COALESCE(p_metadata, '{}'::jsonb),
    p_created_by
  )
  RETURNING * INTO v_inserted;

  RETURN QUERY
  SELECT *
  FROM public.process_draft_versions
  WHERE id = v_inserted.id;
END;
$$;

DROP FUNCTION IF EXISTS public.transition_process_draft_version_atomic(uuid, uuid, uuid, text, uuid);
CREATE OR REPLACE FUNCTION public.transition_process_draft_version_atomic(
  p_tenant_id uuid,
  p_process_task_id uuid,
  p_version_id uuid,
  p_action text,
  p_actor_id uuid
) RETURNS SETOF public.process_draft_versions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current_case_brain_task_id uuid;
  v_version public.process_draft_versions%ROWTYPE;
  v_updated public.process_draft_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_action NOT IN ('approve', 'publish') THEN
    RAISE EXCEPTION 'Acao invalida para workflow da minuta.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_process_task_id::text));

  SELECT *
  INTO v_version
  FROM public.process_draft_versions
  WHERE tenant_id = p_tenant_id
    AND process_task_id = p_process_task_id
    AND id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versao da minuta nao encontrada.';
  END IF;

  SELECT case_brain_task_id
  INTO v_current_case_brain_task_id
  FROM public.process_document_memory
  WHERE tenant_id = p_tenant_id
    AND process_task_id = p_process_task_id
  LIMIT 1;

  IF v_current_case_brain_task_id IS NOT NULL
    AND v_version.source_case_brain_task_id IS DISTINCT FROM v_current_case_brain_task_id THEN
    RAISE EXCEPTION 'A versao da minuta esta desatualizada em relacao ao Case Brain atual.';
  END IF;

  IF p_action = 'publish' AND v_version.workflow_status = 'draft' THEN
    RAISE EXCEPTION 'A versao precisa ser aprovada antes da publicacao.';
  END IF;

  UPDATE public.process_draft_versions
  SET is_current = false
  WHERE tenant_id = p_tenant_id
    AND process_task_id = p_process_task_id
    AND id <> p_version_id
    AND is_current = true;

  UPDATE public.process_draft_versions
  SET workflow_status = CASE
        WHEN p_action = 'publish' THEN 'published'
        WHEN workflow_status = 'published' THEN 'published'
        ELSE 'approved'
      END,
      is_current = true,
      approved_by = CASE
        WHEN approved_by IS NULL AND p_action IN ('approve', 'publish') THEN p_actor_id
        ELSE approved_by
      END,
      approved_at = CASE
        WHEN approved_at IS NULL AND p_action IN ('approve', 'publish') THEN v_now
        ELSE approved_at
      END,
      published_by = CASE
        WHEN p_action = 'publish' THEN p_actor_id
        ELSE published_by
      END,
      published_at = CASE
        WHEN p_action = 'publish' THEN v_now
        ELSE published_at
      END
  WHERE tenant_id = p_tenant_id
    AND process_task_id = p_process_task_id
    AND id = p_version_id
  RETURNING * INTO v_updated;

  RETURN QUERY
  SELECT *
  FROM public.process_draft_versions
  WHERE id = v_updated.id;
END;
$$;
