-- ==============================================================================
-- 20260321041900_processos_tables.sql
-- Objetivo: Criar tabelas do Módulo de Processos (mirroring CRM Pipeline)
-- ==============================================================================

-- 1. Pipelines de Processos
CREATE TABLE IF NOT EXISTS public.process_pipelines (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  tags text[] DEFAULT '{}',
  sectors text[] DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Estágios (Stages)
CREATE TABLE IF NOT EXISTS public.process_stages (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  pipeline_id uuid REFERENCES public.process_pipelines(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#3b82f6',
  order_index integer DEFAULT 0,
  is_win boolean DEFAULT false,
  is_loss boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Tarefas de Processos (Tasks)
CREATE TABLE IF NOT EXISTS public.process_tasks (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  pipeline_id uuid REFERENCES public.process_pipelines(id) ON DELETE CASCADE NOT NULL,
  stage_id uuid REFERENCES public.process_stages(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES public.cases(id) ON DELETE SET NULL, -- Vincula a um caso se houver
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  position_index integer DEFAULT 0,
  value numeric DEFAULT 0,
  tags text[] DEFAULT '{}',
  phone text,
  sector text,
  motivo_perda text,
  lead_scoring integer DEFAULT 0,
  source text,
  processo_1grau text,
  processo_2grau text,
  demanda text,
  andamento_1grau text,
  andamento_2grau text,
  orgao_julgador text,
  tutela_urgencia text,
  sentenca text,
  reu text,
  valor_causa numeric,
  prazo_fatal timestamp with time zone,
  liminar_deferida boolean DEFAULT false,
  data_ultima_movimentacao timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

ALTER TABLE public.process_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_tasks ENABLE ROW LEVEL SECURITY;

-- process_pipelines
CREATE POLICY "Leitura de pipelines do mesmo tenant" ON public.process_pipelines
  FOR SELECT USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

CREATE POLICY "Inserção de pipelines do mesmo tenant" ON public.process_pipelines
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

CREATE POLICY "Atualização de pipelines do mesmo tenant" ON public.process_pipelines
  FOR UPDATE USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

CREATE POLICY "Exclusão de pipelines do mesmo tenant" ON public.process_pipelines
  FOR DELETE USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

-- process_stages
-- Para simplificar, usamos o pipeline_id para buscar o tenant (ou permitimos se o usuário pertencer ao mesmo tenant do pipeline)
CREATE POLICY "Leitura de stages" ON public.process_stages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.process_pipelines p 
    WHERE p.id = process_stages.pipeline_id 
    AND p.tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid
  ));

CREATE POLICY "Alteração de stages" ON public.process_stages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.process_pipelines p 
    WHERE p.id = process_stages.pipeline_id 
    AND p.tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid
  ));

-- process_tasks
CREATE POLICY "Leitura de tasks do tenant" ON public.process_tasks
  FOR SELECT USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

CREATE POLICY "Inserção de tasks do tenant" ON public.process_tasks
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

CREATE POLICY "Atualização de tasks do tenant" ON public.process_tasks
  FOR UPDATE USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

CREATE POLICY "Exclusão de tasks do tenant" ON public.process_tasks
  FOR DELETE USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_process_tasks_tenant ON public.process_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_pipelines_tenant ON public.process_pipelines(tenant_id);
