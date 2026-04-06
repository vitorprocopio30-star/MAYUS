-- ENUMS
CREATE TYPE agent_risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE audit_action_type AS ENUM ('skill_executed', 'skill_blocked', 'awaiting_approval', 'fallback_triggered');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- FUNÇÃO DE UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- TABELA agent_skills
CREATE TABLE agent_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT NOT NULL DEFAULT '1.0',
    schema_version TEXT NOT NULL DEFAULT '1',
    input_schema JSONB,
    output_schema JSONB,
    allowed_roles TEXT[] NOT NULL DEFAULT '{}',
    allowed_channels TEXT[] NOT NULL DEFAULT '{chat}',
    requires_human_confirmation BOOLEAN NOT NULL DEFAULT false,
    risk_level agent_risk_level NOT NULL DEFAULT 'low',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_skill_name_per_tenant UNIQUE (tenant_id, name)
);

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON agent_skills
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- TABELA agent_audit_logs
CREATE TABLE agent_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    skill_invoked TEXT NOT NULL,
    intention_raw TEXT CHECK (char_length(intention_raw) <= 2000),
    payload_executed JSONB,
    status audit_action_type NOT NULL,
    approval_status approval_status,
    approval_context JSONB,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    idempotency_key TEXT NOT NULL,
    idempotency_expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX idx_audit_logs_tenant_id ON agent_audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON agent_audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON agent_audit_logs(created_at DESC);

-- TABELA office_institutional_memory
CREATE TABLE office_institutional_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    enforced BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_memory_key UNIQUE (tenant_id, category, key)
);

-- RLS
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_institutional_memory ENABLE ROW LEVEL SECURITY;

-- POLICIES agent_skills
CREATE POLICY "Select agent_skills same tenant" ON agent_skills
    FOR SELECT TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Insert agent_skills admin only" ON agent_skills
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'socio')
    );

CREATE POLICY "Update agent_skills admin only" ON agent_skills
    FOR UPDATE TO authenticated
    USING (
        tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'socio')
    );

-- POLICIES agent_audit_logs
CREATE POLICY "Select agent_audit_logs same tenant" ON agent_audit_logs
    FOR SELECT TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Insert agent_audit_logs same tenant" ON agent_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- POLICIES office_institutional_memory
CREATE POLICY "Select office_institutional_memory same tenant" ON office_institutional_memory
    FOR SELECT TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Insert office_institutional_memory admin only" ON office_institutional_memory
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'socio')
    );
