DROP FUNCTION IF EXISTS public.create_process_draft_version_atomic(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.create_process_draft_version_atomic(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, uuid, uuid);

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
  p_created_by uuid DEFAULT NULL,
  p_parent_version_id uuid DEFAULT NULL
) RETURNS SETOF public.process_draft_versions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current_version_id uuid;
  v_parent_version_id uuid;
  v_latest_version_number integer;
  v_inserted public.process_draft_versions%ROWTYPE;
BEGIN
  IF p_draft_markdown IS NULL OR btrim(p_draft_markdown) = '' THEN
    RAISE EXCEPTION 'Nao foi possivel registrar a versao da minuta sem conteudo.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_process_task_id::text));

  SELECT id, version_number
  INTO v_current_version_id, v_latest_version_number
  FROM public.process_draft_versions
  WHERE tenant_id = p_tenant_id
    AND process_task_id = p_process_task_id
  ORDER BY version_number DESC
  LIMIT 1;

  IF p_parent_version_id IS NOT NULL
    AND v_current_version_id IS DISTINCT FROM p_parent_version_id THEN
    RAISE EXCEPTION 'A versao base da minuta nao e mais a atual. Recarregue antes de salvar nova revisao.';
  END IF;

  v_parent_version_id := COALESCE(p_parent_version_id, v_current_version_id);

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
