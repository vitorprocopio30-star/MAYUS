-- MAYUS Brain Runtime Foundation

CREATE TABLE IF NOT EXISTS public.brain_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'chat',
  module TEXT NOT NULL DEFAULT 'core',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'planning', 'executing', 'awaiting_input', 'awaiting_approval', 'failed', 'completed', 'completed_with_warnings', 'cancelled')),
  title TEXT,
  goal TEXT NOT NULL,
  task_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  task_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brain_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.brain_tasks(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('queued', 'planning', 'executing', 'awaiting_input', 'awaiting_approval', 'failed', 'completed', 'completed_with_warnings', 'cancelled')),
  summary TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brain_runs_task_attempt_unique UNIQUE (task_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.brain_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.brain_tasks(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.brain_runs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  step_key TEXT NOT NULL,
  title TEXT NOT NULL,
  step_type TEXT NOT NULL DEFAULT 'operation',
  capability_name TEXT,
  handler_type TEXT,
  approval_policy TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'awaiting_input', 'awaiting_approval', 'completed', 'failed', 'cancelled', 'skipped')),
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brain_steps_run_order_unique UNIQUE (run_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.brain_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.brain_tasks(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.brain_runs(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.brain_steps(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  title TEXT,
  storage_url TEXT,
  mime_type TEXT,
  source_module TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brain_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.brain_tasks(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.brain_runs(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.brain_steps(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  risk_level TEXT,
  approval_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_notes TEXT,
  expires_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brain_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.brain_tasks(id) ON DELETE SET NULL,
  run_id UUID REFERENCES public.brain_runs(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'tenant' CHECK (scope IN ('tenant', 'user', 'case', 'task')),
  memory_type TEXT NOT NULL,
  memory_key TEXT,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  confidence NUMERIC(5,2),
  promoted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.brain_tasks(id) ON DELETE SET NULL,
  run_id UUID REFERENCES public.brain_runs(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.brain_steps(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  source_module TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brain_tasks_tenant_created_at ON public.brain_tasks(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_tasks_status ON public.brain_tasks(status);
CREATE INDEX IF NOT EXISTS idx_brain_runs_task_id ON public.brain_runs(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_steps_task_id ON public.brain_steps(task_id, order_index);
CREATE INDEX IF NOT EXISTS idx_brain_steps_run_id ON public.brain_steps(run_id, order_index);
CREATE INDEX IF NOT EXISTS idx_brain_artifacts_task_id ON public.brain_artifacts(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_approvals_task_id ON public.brain_approvals(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_approvals_status ON public.brain_approvals(status);
CREATE INDEX IF NOT EXISTS idx_brain_memories_tenant_scope ON public.brain_memories(tenant_id, scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_events_tenant_type ON public.learning_events(tenant_id, event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_brain_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS tr_brain_tasks_updated_at ON public.brain_tasks;
CREATE TRIGGER tr_brain_tasks_updated_at
  BEFORE UPDATE ON public.brain_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_brain_updated_at();

DROP TRIGGER IF EXISTS tr_brain_runs_updated_at ON public.brain_runs;
CREATE TRIGGER tr_brain_runs_updated_at
  BEFORE UPDATE ON public.brain_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_brain_updated_at();

DROP TRIGGER IF EXISTS tr_brain_steps_updated_at ON public.brain_steps;
CREATE TRIGGER tr_brain_steps_updated_at
  BEFORE UPDATE ON public.brain_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_brain_updated_at();

DROP TRIGGER IF EXISTS tr_brain_approvals_updated_at ON public.brain_approvals;
CREATE TRIGGER tr_brain_approvals_updated_at
  BEFORE UPDATE ON public.brain_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_brain_updated_at();

DROP TRIGGER IF EXISTS tr_brain_memories_updated_at ON public.brain_memories;
CREATE TRIGGER tr_brain_memories_updated_at
  BEFORE UPDATE ON public.brain_memories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_brain_updated_at();

ALTER TABLE public.brain_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select brain_tasks same tenant" ON public.brain_tasks;
CREATE POLICY "Select brain_tasks same tenant" ON public.brain_tasks
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert brain_tasks same tenant" ON public.brain_tasks;
CREATE POLICY "Insert brain_tasks same tenant" ON public.brain_tasks
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update brain_tasks same tenant" ON public.brain_tasks;
CREATE POLICY "Update brain_tasks same tenant" ON public.brain_tasks
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Select brain_runs same tenant" ON public.brain_runs;
CREATE POLICY "Select brain_runs same tenant" ON public.brain_runs
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert brain_runs same tenant" ON public.brain_runs;
CREATE POLICY "Insert brain_runs same tenant" ON public.brain_runs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update brain_runs same tenant" ON public.brain_runs;
CREATE POLICY "Update brain_runs same tenant" ON public.brain_runs
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Select brain_steps same tenant" ON public.brain_steps;
CREATE POLICY "Select brain_steps same tenant" ON public.brain_steps
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert brain_steps same tenant" ON public.brain_steps;
CREATE POLICY "Insert brain_steps same tenant" ON public.brain_steps
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update brain_steps same tenant" ON public.brain_steps;
CREATE POLICY "Update brain_steps same tenant" ON public.brain_steps
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Select brain_artifacts same tenant" ON public.brain_artifacts;
CREATE POLICY "Select brain_artifacts same tenant" ON public.brain_artifacts
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert brain_artifacts same tenant" ON public.brain_artifacts;
CREATE POLICY "Insert brain_artifacts same tenant" ON public.brain_artifacts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update brain_artifacts same tenant" ON public.brain_artifacts;
CREATE POLICY "Update brain_artifacts same tenant" ON public.brain_artifacts
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Select brain_approvals same tenant" ON public.brain_approvals;
CREATE POLICY "Select brain_approvals same tenant" ON public.brain_approvals
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert brain_approvals same tenant" ON public.brain_approvals;
CREATE POLICY "Insert brain_approvals same tenant" ON public.brain_approvals
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update brain_approvals same tenant" ON public.brain_approvals;
CREATE POLICY "Update brain_approvals same tenant" ON public.brain_approvals
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Select brain_memories same tenant" ON public.brain_memories;
CREATE POLICY "Select brain_memories same tenant" ON public.brain_memories
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert brain_memories same tenant" ON public.brain_memories;
CREATE POLICY "Insert brain_memories same tenant" ON public.brain_memories
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update brain_memories same tenant" ON public.brain_memories;
CREATE POLICY "Update brain_memories same tenant" ON public.brain_memories
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Select learning_events same tenant" ON public.learning_events;
CREATE POLICY "Select learning_events same tenant" ON public.learning_events
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Insert learning_events same tenant" ON public.learning_events;
CREATE POLICY "Insert learning_events same tenant" ON public.learning_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Update learning_events same tenant" ON public.learning_events;
CREATE POLICY "Update learning_events same tenant" ON public.learning_events
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
