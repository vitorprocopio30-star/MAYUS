ALTER TABLE public.user_tasks
  ADD COLUMN IF NOT EXISTS reminder_days_before integer;

UPDATE public.user_tasks
SET reminder_days_before = COALESCE(reminder_days_before, 0);

ALTER TABLE public.user_tasks
  ALTER COLUMN reminder_days_before SET DEFAULT 0;

ALTER TABLE public.user_tasks
  DROP CONSTRAINT IF EXISTS user_tasks_reminder_days_before_check;

ALTER TABLE public.user_tasks
  ADD CONSTRAINT user_tasks_reminder_days_before_check CHECK (reminder_days_before >= 0);

CREATE INDEX IF NOT EXISTS idx_user_tasks_reminder_days_before
  ON public.user_tasks(reminder_days_before);
