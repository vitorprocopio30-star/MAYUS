CREATE TABLE IF NOT EXISTS public.user_tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_name_snapshot text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_agent text,
  source_table text,
  source_id text,
  urgency text NOT NULL DEFAULT 'ROTINA' CHECK (urgency IN ('URGENTE', 'ATENCAO', 'ROTINA', 'TRANQUILO')),
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Em andamento', 'Concluído')),
  scheduled_for timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by_name_snapshot text,
  is_critical boolean NOT NULL DEFAULT false,
  category text,
  type text,
  color text,
  client_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_tasks_tenant ON public.user_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_assigned_to ON public.user_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_user_tasks_scheduled_for ON public.user_tasks(scheduled_for);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tasks_source_unique ON public.user_tasks(source_table, source_id) WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

DROP POLICY IF EXISTS "Users can view tasks from their tenant" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can insert tasks for their tenant" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can update tasks from their tenant" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can delete tasks from their tenant" ON public.user_tasks;

CREATE POLICY "Users can view tasks from their tenant" ON public.user_tasks
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert tasks for their tenant" ON public.user_tasks
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update tasks from their tenant" ON public.user_tasks
  FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete tasks from their tenant" ON public.user_tasks
  FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_user_tasks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_user_tasks_updated_at ON public.user_tasks;
CREATE TRIGGER tr_user_tasks_updated_at
  BEFORE UPDATE ON public.user_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_tasks_updated_at();
