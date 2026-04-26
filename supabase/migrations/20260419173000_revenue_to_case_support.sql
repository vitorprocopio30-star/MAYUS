-- MAYUS Revenue-to-Case support

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_tenant_asaas_customer_id
  ON public.clients(tenant_id, asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;
