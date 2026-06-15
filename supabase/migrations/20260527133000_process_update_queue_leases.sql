ALTER TABLE public.process_update_queue
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_hash text;

CREATE INDEX IF NOT EXISTS process_update_queue_claim_idx
  ON public.process_update_queue (status, next_retry_at, created_at)
  WHERE dead_lettered_at IS NULL
    AND status IN ('PENDENTE', 'PROCESSANDO');

CREATE INDEX IF NOT EXISTS process_update_queue_lock_expiry_idx
  ON public.process_update_queue (lock_expires_at)
  WHERE status = 'PROCESSANDO'
    AND lock_expires_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS process_update_queue_event_hash_unique_idx
  ON public.process_update_queue (
    COALESCE(tenant_id::text, '__global__'),
    numero_cnj,
    event_hash
  )
  WHERE event_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_process_update_queue_batch(
  p_limit integer DEFAULT 10,
  p_worker_id text DEFAULT 'mayus-update-agent',
  p_lock_seconds integer DEFAULT 90
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  numero_cnj text,
  evento text,
  payload jsonb,
  status text,
  created_at timestamptz,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 10), 25));
  v_lock_seconds integer := GREATEST(30, LEAST(COALESCE(p_lock_seconds, 90), 300));
  v_worker_id text := COALESCE(NULLIF(p_worker_id, ''), 'mayus-update-agent');
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT q.id
    FROM public.process_update_queue q
    WHERE q.dead_lettered_at IS NULL
      AND (
        (
          q.status = 'PENDENTE'
          AND (q.next_retry_at IS NULL OR q.next_retry_at <= now())
        )
        OR (
          q.status = 'PROCESSANDO'
          AND q.lock_expires_at IS NOT NULL
          AND q.lock_expires_at <= now()
        )
      )
    ORDER BY q.created_at ASC NULLS FIRST
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.process_update_queue q
    SET
      status = 'PROCESSANDO',
      attempt_count = COALESCE(q.attempt_count, 0) + 1,
      locked_at = now(),
      lock_expires_at = now() + make_interval(secs => v_lock_seconds),
      locked_by = v_worker_id,
      next_retry_at = NULL,
      processed_at = NULL,
      last_error = NULL,
      payload = jsonb_set(
        COALESCE(q.payload, '{}'::jsonb),
        '{update_agent}',
        COALESCE(q.payload->'update_agent', '{}'::jsonb)
          || jsonb_build_object(
            'status', 'processing',
            'retry_count', COALESCE(q.attempt_count, 0) + 1,
            'lock_acquired_at', now(),
            'lock_expires_at', now() + make_interval(secs => v_lock_seconds),
            'locked_by', v_worker_id,
            'claim_source', 'rpc'
          ),
        true
      )
    FROM candidates c
    WHERE q.id = c.id
    RETURNING q.*
  )
  SELECT
    claimed.id,
    claimed.tenant_id,
    claimed.numero_cnj,
    claimed.evento,
    claimed.payload,
    claimed.status,
    claimed.created_at,
    claimed.attempt_count
  FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_process_update_queue_batch(integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_process_update_queue_batch(integer, text, integer) TO service_role;

COMMENT ON FUNCTION public.claim_process_update_queue_batch(integer, text, integer) IS
  'Atomically leases process_update_queue items for the MAYUS process monitoring worker.';
