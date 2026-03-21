-- ==============================================================================
-- 07_crm_columns_and_rls.sql
-- Objetivo: Adicionar colunas de controle exigidas pelo PRD do Kanban
-- ==============================================================================

-- Adiciona campos obrigatórios para rastreio e lógica de negócio do Funil
ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS lead_scoring integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_perda text,
  ADD COLUMN IF NOT EXISTS source text, -- UTM source
  ADD COLUMN IF NOT EXISTS value numeric,
  ADD COLUMN IF NOT EXISTS data_ultima_movimentacao timestamp with time zone DEFAULT now();

-- Cria a tabela de notificações (caso ainda não exista) para trocar o Responsável do Lead
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text,
  is_read boolean DEFAULT false,
  link_url text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios leem proprias notificacoes" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Sistema insere notificacoes (trigger internal)" ON public.notifications
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);
