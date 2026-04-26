ALTER TABLE public.process_document_memory
  ADD COLUMN IF NOT EXISTS case_brain_task_id uuid REFERENCES public.brain_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_plan_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS first_draft_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS first_draft_task_id uuid REFERENCES public.brain_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_draft_artifact_id uuid REFERENCES public.brain_artifacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_draft_summary text,
  ADD COLUMN IF NOT EXISTS first_draft_error text,
  ADD COLUMN IF NOT EXISTS first_draft_generated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'process_document_memory_first_draft_status_check'
      AND conrelid = 'public.process_document_memory'::regclass
  ) THEN
    ALTER TABLE public.process_document_memory
      ADD CONSTRAINT process_document_memory_first_draft_status_check
      CHECK (first_draft_status IN ('idle', 'queued', 'running', 'completed', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_process_document_memory_first_draft_status
  ON public.process_document_memory(tenant_id, first_draft_status);

CREATE INDEX IF NOT EXISTS idx_process_document_memory_first_draft_artifact_id
  ON public.process_document_memory(first_draft_artifact_id)
  WHERE first_draft_artifact_id IS NOT NULL;
