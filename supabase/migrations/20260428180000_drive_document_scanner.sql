CREATE TABLE IF NOT EXISTS public.drive_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  root_folder_id text NOT NULL,
  root_folder_name text,
  root_folder_url text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'scanning', 'preview_ready', 'applying', 'completed', 'completed_with_warnings', 'failed', 'cancelled')),
  mode text NOT NULL DEFAULT 'preview' CHECK (mode IN ('preview', 'apply')),
  max_depth integer NOT NULL DEFAULT 4,
  max_items integer NOT NULL DEFAULT 500,
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  brain_task_id uuid REFERENCES public.brain_tasks(id) ON DELETE SET NULL,
  brain_run_id uuid REFERENCES public.brain_runs(id) ON DELETE SET NULL,
  brain_step_id uuid REFERENCES public.brain_steps(id) ON DELETE SET NULL,
  brain_artifact_id uuid REFERENCES public.brain_artifacts(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.drive_scan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scan_run_id uuid NOT NULL REFERENCES public.drive_scan_runs(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  parent_folder_id text,
  parent_path text[] NOT NULL DEFAULT '{}'::text[],
  name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  modified_at timestamptz,
  web_view_link text,
  item_kind text NOT NULL CHECK (item_kind IN ('file', 'folder')),
  detected_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidate_process_task_id uuid REFERENCES public.process_tasks(id) ON DELETE SET NULL,
  candidate_process_number text,
  candidate_client_name text,
  confidence text NOT NULL DEFAULT 'none' CHECK (confidence IN ('high', 'medium', 'low', 'none')),
  review_reason text,
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'proposed', 'review_required', 'ignored', 'applied', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drive_scan_items_run_file_unique UNIQUE (scan_run_id, drive_file_id)
);

CREATE TABLE IF NOT EXISTS public.drive_scan_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scan_run_id uuid NOT NULL REFERENCES public.drive_scan_runs(id) ON DELETE CASCADE,
  scan_item_id uuid NOT NULL REFERENCES public.drive_scan_items(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('move_to_process_folder', 'create_process_folder', 'request_review', 'mark_duplicate', 'ignore')),
  target_process_task_id uuid REFERENCES public.process_tasks(id) ON DELETE SET NULL,
  target_folder_label text,
  target_drive_folder_id text,
  before_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence text NOT NULL DEFAULT 'none' CHECK (confidence IN ('high', 'medium', 'low', 'none')),
  reason text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'review_required', 'approved', 'applied', 'failed', 'rejected', 'skipped')),
  applied_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.drive_scan_item_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scan_item_id uuid NOT NULL REFERENCES public.drive_scan_items(id) ON DELETE CASCADE,
  process_task_id uuid NOT NULL REFERENCES public.process_tasks(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drive_scan_item_matches_unique UNIQUE (scan_item_id, process_task_id)
);

CREATE TABLE IF NOT EXISTS public.mayus_internal_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'module', 'capability')),
  module text NOT NULL,
  capability_key text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  routing_hints jsonb NOT NULL DEFAULT '{}'::jsonb,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_integrations jsonb NOT NULL DEFAULT '[]'::jsonb,
  safe_user_explanation text,
  internal_notes text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mayus_internal_knowledge_unique UNIQUE (scope, module, capability_key, version)
);

CREATE INDEX IF NOT EXISTS idx_drive_scan_runs_tenant_status ON public.drive_scan_runs(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_scan_runs_root ON public.drive_scan_runs(tenant_id, root_folder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_scan_items_run ON public.drive_scan_items(scan_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_drive_scan_items_tenant_candidate ON public.drive_scan_items(tenant_id, candidate_process_task_id) WHERE candidate_process_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_scan_actions_run_status ON public.drive_scan_actions(scan_run_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_drive_scan_actions_target_process ON public.drive_scan_actions(tenant_id, target_process_task_id) WHERE target_process_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_scan_item_matches_item ON public.drive_scan_item_matches(scan_item_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_mayus_internal_knowledge_lookup ON public.mayus_internal_knowledge(module, capability_key, status);

CREATE OR REPLACE FUNCTION public.handle_drive_scanner_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_drive_scan_runs_updated_at ON public.drive_scan_runs;
CREATE TRIGGER tr_drive_scan_runs_updated_at
  BEFORE UPDATE ON public.drive_scan_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_drive_scanner_updated_at();

DROP TRIGGER IF EXISTS tr_drive_scan_items_updated_at ON public.drive_scan_items;
CREATE TRIGGER tr_drive_scan_items_updated_at
  BEFORE UPDATE ON public.drive_scan_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_drive_scanner_updated_at();

DROP TRIGGER IF EXISTS tr_drive_scan_actions_updated_at ON public.drive_scan_actions;
CREATE TRIGGER tr_drive_scan_actions_updated_at
  BEFORE UPDATE ON public.drive_scan_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_drive_scanner_updated_at();

DROP TRIGGER IF EXISTS tr_mayus_internal_knowledge_updated_at ON public.mayus_internal_knowledge;
CREATE TRIGGER tr_mayus_internal_knowledge_updated_at
  BEFORE UPDATE ON public.mayus_internal_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_drive_scanner_updated_at();

ALTER TABLE public.drive_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_scan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_scan_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_scan_item_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mayus_internal_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select drive_scan_runs same tenant" ON public.drive_scan_runs;
CREATE POLICY "Select drive_scan_runs same tenant" ON public.drive_scan_runs
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert drive_scan_runs same tenant" ON public.drive_scan_runs;
CREATE POLICY "Insert drive_scan_runs same tenant" ON public.drive_scan_runs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update drive_scan_runs same tenant" ON public.drive_scan_runs;
CREATE POLICY "Update drive_scan_runs same tenant" ON public.drive_scan_runs
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Select drive_scan_items same tenant" ON public.drive_scan_items;
CREATE POLICY "Select drive_scan_items same tenant" ON public.drive_scan_items
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert drive_scan_items same tenant" ON public.drive_scan_items;
CREATE POLICY "Insert drive_scan_items same tenant" ON public.drive_scan_items
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update drive_scan_items same tenant" ON public.drive_scan_items;
CREATE POLICY "Update drive_scan_items same tenant" ON public.drive_scan_items
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Select drive_scan_actions same tenant" ON public.drive_scan_actions;
CREATE POLICY "Select drive_scan_actions same tenant" ON public.drive_scan_actions
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert drive_scan_actions same tenant" ON public.drive_scan_actions;
CREATE POLICY "Insert drive_scan_actions same tenant" ON public.drive_scan_actions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update drive_scan_actions same tenant" ON public.drive_scan_actions;
CREATE POLICY "Update drive_scan_actions same tenant" ON public.drive_scan_actions
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Select drive_scan_item_matches same tenant" ON public.drive_scan_item_matches;
CREATE POLICY "Select drive_scan_item_matches same tenant" ON public.drive_scan_item_matches
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert drive_scan_item_matches same tenant" ON public.drive_scan_item_matches;
CREATE POLICY "Insert drive_scan_item_matches same tenant" ON public.drive_scan_item_matches
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

INSERT INTO public.mayus_internal_knowledge (
  scope,
  module,
  capability_key,
  title,
  summary,
  routing_hints,
  constraints,
  required_integrations,
  safe_user_explanation,
  internal_notes,
  tags,
  version,
  status
) VALUES (
  'capability',
  'documentos',
  'drive_document_scanner',
  'Scanner agentico de acervo documental do Drive',
  'Analisa uma pasta raiz do Google Drive, cruza documentos com processos/OAB, gera preview supervisionado e alimenta o cerebro documental do MAYUS.',
  '{"intents":["organizar drive","analisar acervo","importar documentos antigos","scanner documental"],"preferred_flow":"preview_then_apply"}'::jsonb,
  '{"external_side_effects":"preview_only_until_approval","low_confidence":"human_review_required","raw_text_before_approval":"forbidden","secret_exposure":"forbidden"}'::jsonb,
  '["google_drive","llm_optional"]'::jsonb,
  'Posso analisar uma pasta do Drive, mostrar uma previa de organizacao e aplicar apenas o que voce aprovar.',
  'Use somente em contexto server-side. Nao expor rotas, nomes de tabela, payloads tecnicos ou segredos ao usuario final.',
  ARRAY['documentos','drive','lex','brain','preview'],
  1,
  'active'
) ON CONFLICT (scope, module, capability_key, version) DO UPDATE SET
  summary = EXCLUDED.summary,
  routing_hints = EXCLUDED.routing_hints,
  constraints = EXCLUDED.constraints,
  required_integrations = EXCLUDED.required_integrations,
  safe_user_explanation = EXCLUDED.safe_user_explanation,
  internal_notes = EXCLUDED.internal_notes,
  tags = EXCLUDED.tags,
  status = EXCLUDED.status,
  updated_at = now();
