-- Inteligencia estruturada para movimentacoes processuais
-- Guarda o entendimento do MAYUS sobre cada movimentacao recebida do Escavador.

DO $$
BEGIN
  IF to_regclass('public.process_movimentacoes') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.process_movimentacoes
    ADD COLUMN IF NOT EXISTS escavador_movimentacao_id text,
    ADD COLUMN IF NOT EXISTS tipo_evento text,
    ADD COLUMN IF NOT EXISTS requer_acao boolean,
    ADD COLUMN IF NOT EXISTS acao_sugerida text,
    ADD COLUMN IF NOT EXISTS prazo_extraido_dias integer,
    ADD COLUMN IF NOT EXISTS data_vencimento_extraida timestamptz,
    ADD COLUMN IF NOT EXISTS confianca_analise text,
    ADD COLUMN IF NOT EXISTS analise_json jsonb,
    ADD COLUMN IF NOT EXISTS analisado_em timestamptz;

  CREATE INDEX IF NOT EXISTS idx_process_movimentacoes_tenant_escavador_mov
    ON public.process_movimentacoes (tenant_id, escavador_movimentacao_id)
    WHERE escavador_movimentacao_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_process_movimentacoes_tipo_evento
    ON public.process_movimentacoes (tenant_id, tipo_evento, created_at DESC)
    WHERE tipo_evento IS NOT NULL;
END $$;
