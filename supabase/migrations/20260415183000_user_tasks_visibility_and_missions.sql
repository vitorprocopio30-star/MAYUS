ALTER TABLE public.user_tasks
  ADD COLUMN IF NOT EXISTS visibility text,
  ADD COLUMN IF NOT EXISTS task_kind text,
  ADD COLUMN IF NOT EXISTS reward_coins integer,
  ADD COLUMN IF NOT EXISTS mission_type text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_role text;

UPDATE public.user_tasks
SET
  visibility = COALESCE(visibility, 'global'),
  task_kind = COALESCE(task_kind, 'task'),
  reward_coins = COALESCE(reward_coins,
    CASE
      WHEN urgency = 'URGENTE' THEN 100
      WHEN urgency = 'ATENCAO' THEN 50
      ELSE 20
    END
  );

ALTER TABLE public.user_tasks
  ALTER COLUMN visibility SET DEFAULT 'global',
  ALTER COLUMN task_kind SET DEFAULT 'task',
  ALTER COLUMN reward_coins SET DEFAULT 20;

ALTER TABLE public.user_tasks
  DROP CONSTRAINT IF EXISTS user_tasks_visibility_check,
  ADD CONSTRAINT user_tasks_visibility_check CHECK (visibility IN ('private', 'global'));

ALTER TABLE public.user_tasks
  DROP CONSTRAINT IF EXISTS user_tasks_task_kind_check,
  ADD CONSTRAINT user_tasks_task_kind_check CHECK (task_kind IN ('task', 'mission'));

CREATE INDEX IF NOT EXISTS idx_user_tasks_visibility ON public.user_tasks(visibility);
CREATE INDEX IF NOT EXISTS idx_user_tasks_task_kind ON public.user_tasks(task_kind);
