-- ==============================================================================
-- 08_crm_stages_flags.sql
-- Objetivo: Adicionar flags de Vitória (is_win) e Perda (is_loss) nas colunas do quadro Kanban
-- ==============================================================================

-- Adiciona os controladores lógicos nas etapas do pipeline (caso não existam)
ALTER TABLE public.crm_stages
  ADD COLUMN IF NOT EXISTS is_loss boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_win boolean DEFAULT false;
