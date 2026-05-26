-- Monitoring overage billing foundation.
-- Keeps MAYUS platform overages separate from office/client financials.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS monitoring_included_process_limit integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS monitoring_extra_process_price_cents integer NOT NULL DEFAULT 97,
  ADD COLUMN IF NOT EXISTS monitoring_overage_status text NOT NULL DEFAULT 'excedente_bloqueado',
  ADD COLUMN IF NOT EXISTS monitoring_payment_method_status text NOT NULL DEFAULT 'cartao_pendente',
  ADD COLUMN IF NOT EXISTS monitoring_overage_terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS monitoring_overage_terms_accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monitoring_overage_blocked_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_monitoring_included_process_limit_nonnegative'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_monitoring_included_process_limit_nonnegative
      CHECK (monitoring_included_process_limit >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_monitoring_extra_process_price_cents_nonnegative'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_monitoring_extra_process_price_cents_nonnegative
      CHECK (monitoring_extra_process_price_cents >= 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_monitoring_overage_status_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_monitoring_overage_status_check
      CHECK (monitoring_overage_status IN (
        'excedente_liberado',
        'cartao_pendente',
        'pagamento_excedente_pendente',
        'excedente_inadimplente',
        'excedente_bloqueado',
        'excedente_pausado'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_monitoring_payment_method_status_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_monitoring_payment_method_status_check
      CHECK (monitoring_payment_method_status IN (
        'cartao_pendente',
        'metodo_valido',
        'metodo_invalido',
        'pagamento_pendente',
        'inadimplente'
      ));
  END IF;
END $$;

UPDATE public.tenants
SET
  monitoring_included_process_limit = COALESCE(monitoring_included_process_limit, max_processos, 100),
  monitoring_extra_process_price_cents = COALESCE(monitoring_extra_process_price_cents, 97),
  monitoring_payment_method_status = CASE
    WHEN asaas_customer_id IS NOT NULL AND asaas_subscription_id IS NOT NULL AND status IN ('ativo', 'trial') THEN 'metodo_valido'
    WHEN status = 'inadimplente' THEN 'inadimplente'
    ELSE COALESCE(monitoring_payment_method_status, 'cartao_pendente')
  END,
  monitoring_overage_status = CASE
    WHEN asaas_customer_id IS NOT NULL AND asaas_subscription_id IS NOT NULL AND status IN ('ativo', 'trial') THEN 'excedente_liberado'
    WHEN status = 'inadimplente' THEN 'excedente_inadimplente'
    ELSE COALESCE(monitoring_overage_status, 'excedente_bloqueado')
  END;

CREATE TABLE IF NOT EXISTS public.platform_usage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  metric text NOT NULL,
  included_quantity integer NOT NULL DEFAULT 0,
  current_quantity integer NOT NULL DEFAULT 0,
  peak_quantity integer NOT NULL DEFAULT 0,
  overage_quantity integer NOT NULL DEFAULT 0,
  unit_price_cents integer NOT NULL DEFAULT 0,
  projected_amount_cents integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'mayus',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_usage_snapshots_metric_check CHECK (metric IN ('monitored_processes')),
  CONSTRAINT platform_usage_snapshots_unique UNIQUE (tenant_id, cycle_start, cycle_end, metric)
);

CREATE TABLE IF NOT EXISTS public.platform_overage_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usage_snapshot_id uuid REFERENCES public.platform_usage_snapshots(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mayus_platform',
  status text NOT NULL DEFAULT 'draft',
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  metric text NOT NULL DEFAULT 'monitored_processes',
  included_quantity integer NOT NULL DEFAULT 100,
  peak_quantity integer NOT NULL DEFAULT 0,
  overage_quantity integer NOT NULL DEFAULT 0,
  unit_price_cents integer NOT NULL DEFAULT 97,
  amount_cents integer NOT NULL DEFAULT 0,
  asaas_customer_id text,
  asaas_payment_id text,
  invoice_url text,
  payment_link text,
  due_date date,
  paid_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_overage_charges_status_check CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'failed', 'cancelled', 'waived')),
  CONSTRAINT platform_overage_charges_unique UNIQUE (tenant_id, cycle_start, cycle_end, metric)
);

CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  creditos numeric NOT NULL DEFAULT 0,
  provider text NOT NULL DEFAULT 'escavador',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_usage_snapshots_tenant_cycle
  ON public.platform_usage_snapshots(tenant_id, cycle_start DESC, metric);

CREATE INDEX IF NOT EXISTS idx_platform_overage_charges_tenant_status
  ON public.platform_overage_charges(tenant_id, status, cycle_start DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_tenant_created
  ON public.api_usage_log(tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_monitoring_overage_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_platform_usage_snapshots_updated_at ON public.platform_usage_snapshots;
CREATE TRIGGER tr_platform_usage_snapshots_updated_at
  BEFORE UPDATE ON public.platform_usage_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_monitoring_overage_updated_at();

DROP TRIGGER IF EXISTS tr_platform_overage_charges_updated_at ON public.platform_overage_charges;
CREATE TRIGGER tr_platform_overage_charges_updated_at
  BEFORE UPDATE ON public.platform_overage_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_monitoring_overage_updated_at();

CREATE OR REPLACE FUNCTION public.check_monitoramento_capacity(p_tenant_id uuid)
RETURNS TABLE (
  total_monitorados integer,
  gratuitos integer,
  disponivel_sem_custo integer,
  preco_extra numeric,
  preco_extra_centavos integer,
  excedente_atual integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tenant_policy AS (
    SELECT
      COALESCE(monitoring_included_process_limit, max_processos, 100) AS included_limit,
      COALESCE(monitoring_extra_process_price_cents, 97) AS extra_price_cents
    FROM public.tenants
    WHERE id = p_tenant_id
  ), active_monitored AS (
    SELECT COUNT(*)::integer AS total
    FROM public.monitored_processes
    WHERE tenant_id = p_tenant_id
      AND ativo = true
      AND monitoramento_ativo = true
      AND escavador_monitoramento_id IS NOT NULL
  )
  SELECT
    COALESCE(active_monitored.total, 0) AS total_monitorados,
    COALESCE(tenant_policy.included_limit, 100) AS gratuitos,
    GREATEST(COALESCE(tenant_policy.included_limit, 100) - COALESCE(active_monitored.total, 0), 0) AS disponivel_sem_custo,
    (COALESCE(tenant_policy.extra_price_cents, 97)::numeric / 100) AS preco_extra,
    COALESCE(tenant_policy.extra_price_cents, 97) AS preco_extra_centavos,
    GREATEST(COALESCE(active_monitored.total, 0) - COALESCE(tenant_policy.included_limit, 100), 0) AS excedente_atual
  FROM tenant_policy
  CROSS JOIN active_monitored;
$$;

CREATE OR REPLACE FUNCTION public.increment_processos_monitorados(p_tenant_id uuid, p_quantidade integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Legacy compatibility: capacity is now computed from active monitored rows.
  INSERT INTO public.system_event_logs (tenant_id, source, provider, event_name, status, payload)
  VALUES (
    p_tenant_id,
    'monitoramento',
    'mayus',
    'increment_processos_monitorados_legacy_noop',
    'ok',
    jsonb_build_object('quantidade', COALESCE(p_quantidade, 0), 'computed_capacity', true)
  );
END;
$$;

ALTER TABLE public.platform_usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_overage_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can read platform usage snapshots" ON public.platform_usage_snapshots;
CREATE POLICY "Superadmins can read platform usage snapshots"
  ON public.platform_usage_snapshots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true));

DROP POLICY IF EXISTS "Superadmins can read platform overage charges" ON public.platform_overage_charges;
CREATE POLICY "Superadmins can read platform overage charges"
  ON public.platform_overage_charges
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true));

DROP POLICY IF EXISTS "Superadmins can read api usage log" ON public.api_usage_log;
CREATE POLICY "Superadmins can read api usage log"
  ON public.api_usage_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true));
