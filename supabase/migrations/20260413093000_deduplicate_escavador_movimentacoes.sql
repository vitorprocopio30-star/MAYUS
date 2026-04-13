-- Deduplicacao de movimentacoes do Escavador
-- Evita criacao de cards/prazos duplicados em retries de webhook

DO $$
BEGIN
  IF to_regclass('public.process_tasks') IS NOT NULL THEN
    ALTER TABLE public.process_tasks
      ADD COLUMN IF NOT EXISTS escavador_movimentacao_id text;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_process_tasks_tenant_escavador_mov
      ON public.process_tasks (pipeline_id, escavador_movimentacao_id)
      WHERE escavador_movimentacao_id IS NOT NULL;
  END IF;

  IF to_regclass('public.process_prazos') IS NOT NULL THEN
    ALTER TABLE public.process_prazos
      ADD COLUMN IF NOT EXISTS escavador_movimentacao_id text;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_process_prazos_processo_escavador_mov
      ON public.process_prazos (monitored_process_id, escavador_movimentacao_id)
      WHERE escavador_movimentacao_id IS NOT NULL;
  END IF;
END $$;
