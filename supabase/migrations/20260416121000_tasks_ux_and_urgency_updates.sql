ALTER TABLE public.process_tasks
  ADD COLUMN IF NOT EXISTS process_number text,
  ADD COLUMN IF NOT EXISTS responsible_notes text,
  ADD COLUMN IF NOT EXISTS urgency text;

UPDATE public.process_tasks
SET
  urgency = COALESCE(urgency, 'ROTINA'),
  process_number = COALESCE(process_number, NULLIF(title, ''));

ALTER TABLE public.process_tasks
  ALTER COLUMN urgency SET DEFAULT 'ROTINA';

ALTER TABLE public.process_tasks
  DROP CONSTRAINT IF EXISTS process_tasks_urgency_check,
  ADD CONSTRAINT process_tasks_urgency_check CHECK (urgency IN ('URGENTE', 'ATENCAO', 'ROTINA'));

ALTER TABLE public.user_tasks
  ADD COLUMN IF NOT EXISTS process_number text,
  ADD COLUMN IF NOT EXISTS responsible_notes text;

UPDATE public.user_tasks
SET urgency = CASE
  WHEN urgency = 'TRANQUILO' THEN 'ROTINA'
  ELSE COALESCE(urgency, 'ROTINA')
END;

ALTER TABLE public.user_tasks
  DROP CONSTRAINT IF EXISTS user_tasks_urgency_check,
  ADD CONSTRAINT user_tasks_urgency_check CHECK (urgency IN ('URGENTE', 'ATENCAO', 'ROTINA'));

CREATE INDEX IF NOT EXISTS idx_process_tasks_process_number ON public.process_tasks(process_number);
CREATE INDEX IF NOT EXISTS idx_user_tasks_process_number ON public.user_tasks(process_number);
