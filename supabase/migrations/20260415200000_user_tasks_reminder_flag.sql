ALTER TABLE public.user_tasks
  ADD COLUMN IF NOT EXISTS show_only_on_date boolean;

UPDATE public.user_tasks
SET show_only_on_date = COALESCE(show_only_on_date, false);

ALTER TABLE public.user_tasks
  ALTER COLUMN show_only_on_date SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_tasks_show_only_on_date
  ON public.user_tasks(show_only_on_date);
