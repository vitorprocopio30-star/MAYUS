-- MAYUS platform billing ledger.
-- Keeps MAYUS SaaS subscription events separate from tenant office financials.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS billing_cycle text DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS billing_cycle_start timestamptz,
  ADD COLUMN IF NOT EXISTS billing_cycle_end timestamptz,
  ADD COLUMN IF NOT EXISTS max_processos integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS platform_billing_amount_cents integer,
  ADD COLUMN IF NOT EXISTS platform_billing_currency text DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS platform_billing_last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_value numeric,
  ADD COLUMN IF NOT EXISTS last_payment_id text;

UPDATE public.tenants
SET
  status = COALESCE(status, 'trial'),
  billing_cycle = COALESCE(billing_cycle, 'mensal'),
  max_processos = COALESCE(max_processos, 100),
  platform_billing_currency = COALESCE(platform_billing_currency, 'BRL')
WHERE status IS NULL
  OR billing_cycle IS NULL
  OR max_processos IS NULL
  OR platform_billing_currency IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN status SET DEFAULT 'trial',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN billing_cycle SET DEFAULT 'mensal',
  ALTER COLUMN platform_billing_currency SET DEFAULT 'BRL',
  ALTER COLUMN platform_billing_currency SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_platform_billing_status
  ON public.tenants(status, billing_cycle);

CREATE INDEX IF NOT EXISTS idx_tenants_asaas_subscription_id
  ON public.tenants(asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.platform_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'asaas',
  event_name text,
  external_id text,
  customer_id text NOT NULL,
  subscription_id text,
  payment_id text,
  asaas_event text NOT NULL,
  event_type text NOT NULL,
  billing_status text,
  amount_cents integer,
  currency text NOT NULL DEFAULT 'BRL',
  gross_amount numeric,
  net_amount numeric,
  status text,
  due_date date,
  paid_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_billing_events
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'asaas',
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS subscription_id text,
  ADD COLUMN IF NOT EXISTS payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_event text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS billing_status text,
  ADD COLUMN IF NOT EXISTS amount_cents integer,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS gross_amount numeric,
  ADD COLUMN IF NOT EXISTS net_amount numeric,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_billing_events_provider_external
  ON public.platform_billing_events(provider, event_name, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_billing_events_payment_event
  ON public.platform_billing_events(payment_id, asaas_event)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_billing_events_tenant_occurred
  ON public.platform_billing_events(tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_billing_events_status_occurred
  ON public.platform_billing_events(event_type, billing_status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_billing_events_subscription
  ON public.platform_billing_events(subscription_id)
  WHERE subscription_id IS NOT NULL;

ALTER TABLE public.platform_billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can read platform billing events" ON public.platform_billing_events;

CREATE POLICY "Superadmins can read platform billing events"
  ON public.platform_billing_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_superadmin = true
    )
  );
