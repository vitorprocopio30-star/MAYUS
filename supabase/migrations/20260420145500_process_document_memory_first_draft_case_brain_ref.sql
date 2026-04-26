ALTER TABLE public.process_document_memory
  ADD COLUMN IF NOT EXISTS first_draft_case_brain_task_id uuid REFERENCES public.brain_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_process_document_memory_first_draft_case_brain_task_id
  ON public.process_document_memory(first_draft_case_brain_task_id)
  WHERE first_draft_case_brain_task_id IS NOT NULL;
