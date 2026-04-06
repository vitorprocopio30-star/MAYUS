-- POLICIES
DROP POLICY IF EXISTS "Select agent_skills same tenant" ON agent_skills;
DROP POLICY IF EXISTS "Insert agent_skills admin only" ON agent_skills;
DROP POLICY IF EXISTS "Update agent_skills admin only" ON agent_skills;
DROP POLICY IF EXISTS "Select agent_audit_logs same tenant" ON agent_audit_logs;
DROP POLICY IF EXISTS "Insert agent_audit_logs same tenant" ON agent_audit_logs;
DROP POLICY IF EXISTS "Select office_institutional_memory same tenant" ON office_institutional_memory;
DROP POLICY IF EXISTS "Insert office_institutional_memory admin only" ON office_institutional_memory;

-- TRIGGERS E FUNÇÕES
DROP TRIGGER IF EXISTS set_updated_at ON agent_skills;
DROP FUNCTION IF EXISTS update_updated_at();

-- TABELAS
DROP TABLE IF EXISTS agent_audit_logs CASCADE;
DROP TABLE IF EXISTS agent_skills CASCADE;
DROP TABLE IF EXISTS office_institutional_memory CASCADE;

-- TYPES
DROP TYPE IF EXISTS approval_status;
DROP TYPE IF EXISTS audit_action_type;
DROP TYPE IF EXISTS agent_risk_level;
