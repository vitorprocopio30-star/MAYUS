-- MAYUS — Conta Mestre: colunas de suporte ao webhook ASAAS

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS activated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

ALTER TABLE agent_audit_logs
  ADD COLUMN IF NOT EXISTS action            TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id         UUID REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payload_executed  JSONB,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tenants_asaas_customer_id
  ON tenants(asaas_customer_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id
  ON agent_audit_logs(tenant_id);
