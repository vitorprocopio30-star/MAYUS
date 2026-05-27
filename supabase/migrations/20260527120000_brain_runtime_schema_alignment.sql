ALTER TABLE public.brain_runs
  ADD COLUMN IF NOT EXISTS output_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.brain_steps
  ADD COLUMN IF NOT EXISTS error_message text;

COMMENT ON COLUMN public.brain_runs.output_payload IS
  'Structured runtime output used by Brain inbox, mission control, and agentic surfaces.';

COMMENT ON COLUMN public.brain_steps.error_message IS
  'Human-readable runtime error for UI/log surfaces; structured details stay in error_payload.';
