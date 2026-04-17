ALTER TABLE public.user_tasks
  ADD COLUMN IF NOT EXISTS process_number text,
  ADD COLUMN IF NOT EXISTS responsible_notes text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];

UPDATE public.user_tasks
SET urgency = CASE
  WHEN upper(coalesce(urgency, '')) = 'TRANQUILO' THEN 'ROTINA'
  WHEN urgency IS NULL THEN 'ROTINA'
  ELSE urgency
END;

UPDATE public.user_tasks
SET category = CASE
  WHEN upper(coalesce(category, '')) = 'TRANQUILO' THEN 'ROTINA'
  ELSE category
END;

ALTER TABLE public.user_tasks
  DROP CONSTRAINT IF EXISTS user_tasks_urgency_check,
  ADD CONSTRAINT user_tasks_urgency_check CHECK (urgency IN ('URGENTE', 'ATENCAO', 'ROTINA'));

CREATE INDEX IF NOT EXISTS idx_user_tasks_tags ON public.user_tasks USING gin(tags);
