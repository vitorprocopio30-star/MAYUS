ALTER TABLE public.process_tasks
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_perda text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS lead_scoring integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_ultima_movimentacao timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS drive_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_structure_ready boolean NOT NULL DEFAULT false;

UPDATE public.process_tasks pt
SET
  tenant_id = pp.tenant_id,
  data_ultima_movimentacao = COALESCE(pt.data_ultima_movimentacao, pt.updated_at, pt.created_at, now()),
  drive_folder_id = COALESCE(pt.drive_folder_id, substring(pt.drive_link from '/folders/([^/?]+)')),
  drive_structure_ready = COALESCE(pt.drive_structure_ready, false) OR pt.drive_link IS NOT NULL
FROM public.process_pipelines pp
WHERE pp.id = pt.pipeline_id
  AND (pt.tenant_id IS NULL OR pt.data_ultima_movimentacao IS NULL OR pt.drive_folder_id IS NULL OR pt.drive_link IS NOT NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'process_tasks_tenant_id_fkey'
      AND conrelid = 'public.process_tasks'::regclass
  ) THEN
    ALTER TABLE public.process_tasks
      ADD CONSTRAINT process_tasks_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.process_tasks
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN value SET DEFAULT 0,
  ALTER COLUMN lead_scoring SET DEFAULT 0,
  ALTER COLUMN data_ultima_movimentacao SET DEFAULT now(),
  ALTER COLUMN drive_structure_ready SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_process_tasks_tenant_id ON public.process_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_tasks_drive_folder_id ON public.process_tasks(drive_folder_id) WHERE drive_folder_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.process_document_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  process_task_id uuid NOT NULL REFERENCES public.process_tasks(id) ON DELETE CASCADE,
  drive_folder_id text,
  drive_folder_url text,
  drive_folder_name text,
  folder_structure jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_count integer NOT NULL DEFAULT 0,
  sync_status text NOT NULL DEFAULT 'pending',
  last_synced_at timestamptz,
  summary_master text,
  key_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_phase text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_document_memory_process_task_unique UNIQUE (process_task_id)
);

ALTER TABLE public.process_document_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view process document memory from their tenant" ON public.process_document_memory;
DROP POLICY IF EXISTS "Users can insert process document memory from their tenant" ON public.process_document_memory;
DROP POLICY IF EXISTS "Users can update process document memory from their tenant" ON public.process_document_memory;
DROP POLICY IF EXISTS "Users can delete process document memory from their tenant" ON public.process_document_memory;

CREATE POLICY "Users can view process document memory from their tenant" ON public.process_document_memory
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert process document memory from their tenant" ON public.process_document_memory
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update process document memory from their tenant" ON public.process_document_memory
  FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete process document memory from their tenant" ON public.process_document_memory
  FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_process_document_memory_tenant_id ON public.process_document_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_document_memory_task_id ON public.process_document_memory(process_task_id);

CREATE OR REPLACE FUNCTION public.handle_process_document_memory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_process_document_memory_updated_at ON public.process_document_memory;
CREATE TRIGGER tr_process_document_memory_updated_at
  BEFORE UPDATE ON public.process_document_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_process_document_memory_updated_at();
