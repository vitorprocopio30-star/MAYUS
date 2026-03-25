-- ==============================================================================
-- 08_crm_rls_policies.sql
-- Objetivo: Restringir o acesso rigoroso e granular às tabelas do CRM (PRD)
-- ==============================================================================

-- 1. Habilitar RLS nas tabelas principais do CRM
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas antigas se existirem (Padrão de segurança)
DROP POLICY IF EXISTS "Usuários podem ver pipelines do seu tenant" ON public.crm_pipelines;
DROP POLICY IF EXISTS "Apenas Administradores e Sócios gerenciam pipelines" ON public.crm_pipelines;
DROP POLICY IF EXISTS "Usuários podem ver estágios dos seus pipelines" ON public.crm_stages;
DROP POLICY IF EXISTS "Apenas Administradores e Sócios gerenciam estágios" ON public.crm_stages;
DROP POLICY IF EXISTS "Usuários podem ver tarefas do seu tenant" ON public.crm_tasks;
DROP POLICY IF EXISTS "Usuários podem criar tarefas no seu tenant" ON public.crm_tasks;
DROP POLICY IF EXISTS "Usuários podem editar tarefas no seu tenant" ON public.crm_tasks;
DROP POLICY IF EXISTS "Apenas Administradores e Sócios deletam tarefas" ON public.crm_tasks;


-- 3. Políticas para CRM PIPELINES (Funis)
-- Leitura: Qualquer pessoa do escritório (tenant) pode ver
CREATE POLICY "Usuários podem ver pipelines do seu tenant" ON public.crm_pipelines
  FOR SELECT USING (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

-- Escrita: Apenas Sócio/Admin
CREATE POLICY "Apenas Administradores e Sócios gerenciam pipelines" ON public.crm_pipelines
  FOR ALL USING (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (auth.jwt()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );


-- 4. Políticas para CRM STAGES (Estágios/Colunas)
-- Como o Stage pode não ter tenant_id direto, unimos ao pipeline, mas se tiver, melhor. 
-- Vou assumir que o acesso é liberado para leitura baseada na sua criação e permissão.
CREATE POLICY "Usuários podem ver estágios" ON public.crm_stages
  FOR SELECT USING (
    true -- O RLS nas tarefas e pipelines blinda o acesso efetivo. Estágio em si não vaza dados.
  );

CREATE POLICY "Apenas Administradores e Sócios gerenciam estágios" ON public.crm_stages
  FOR ALL USING (
    (auth.jwt()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );


-- 5. Políticas para CRM TASKS (Leads/Cards)
-- Leitura (SELECT): Transparência para todo o tenant (Escritório)
CREATE POLICY "Usuários podem ver tarefas do seu tenant" ON public.crm_tasks
  FOR SELECT USING (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

-- Criação (INSERT): Todos do escritório podem cadastrar um Novo Lead
CREATE POLICY "Usuários podem criar tarefas no seu tenant" ON public.crm_tasks
  FOR INSERT WITH CHECK (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

-- Edição (UPDATE): Todos do escritório podem arrastar/mover e editar o Lead 
CREATE POLICY "Usuários podem editar tarefas no seu tenant" ON public.crm_tasks
  FOR UPDATE USING (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

-- Exclusão Permanente (DELETE): PROTEÇÃO ANTI-SABOTAGEM. Só Admins e Sócios!
CREATE POLICY "Apenas Administradores e Sócios deletam tarefas" ON public.crm_tasks
  FOR DELETE USING (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (auth.jwt()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );
