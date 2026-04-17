CREATE TABLE IF NOT EXISTS public.tenant_oab_monitoramentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  oab_estado text NOT NULL,
  oab_numero text NOT NULL,
  advogado_nome text,
  monitoramento_oab_id text,
  monitoramento_ativo boolean NOT NULL DEFAULT true,
  ultima_sincronizacao timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_oab_monitoramentos_unique
  ON public.tenant_oab_monitoramentos(tenant_id, oab_estado, oab_numero);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_oab_monitoramentos_monitoramento_id
  ON public.tenant_oab_monitoramentos(monitoramento_oab_id)
  WHERE monitoramento_oab_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_oab_monitoramentos_tenant
  ON public.tenant_oab_monitoramentos(tenant_id);

INSERT INTO public.tenant_oab_monitoramentos (
  tenant_id,
  oab_estado,
  oab_numero,
  advogado_nome,
  monitoramento_ativo,
  ultima_sincronizacao,
  created_at,
  updated_at
)
SELECT
  tenant_id,
  upper(oab_estado),
  regexp_replace(oab_numero, '\D', '', 'g'),
  advogado,
  false,
  ultima_busca,
  coalesce(created_at, now()),
  now()
FROM public.oabs_salvas
WHERE tenant_id IS NOT NULL
  AND coalesce(oab_estado, '') <> ''
  AND coalesce(oab_numero, '') <> ''
ON CONFLICT (tenant_id, oab_estado, oab_numero)
DO UPDATE SET
  advogado_nome = coalesce(excluded.advogado_nome, public.tenant_oab_monitoramentos.advogado_nome),
  ultima_sincronizacao = coalesce(excluded.ultima_sincronizacao, public.tenant_oab_monitoramentos.ultima_sincronizacao),
  updated_at = now();

ALTER TABLE public.tenant_oab_monitoramentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de OAB monitorada do tenant" ON public.tenant_oab_monitoramentos;
CREATE POLICY "Leitura de OAB monitorada do tenant"
  ON public.tenant_oab_monitoramentos
  FOR SELECT
  USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

DROP POLICY IF EXISTS "Insercao de OAB monitorada do tenant" ON public.tenant_oab_monitoramentos;
CREATE POLICY "Insercao de OAB monitorada do tenant"
  ON public.tenant_oab_monitoramentos
  FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

DROP POLICY IF EXISTS "Atualizacao de OAB monitorada do tenant" ON public.tenant_oab_monitoramentos;
CREATE POLICY "Atualizacao de OAB monitorada do tenant"
  ON public.tenant_oab_monitoramentos
  FOR UPDATE
  USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

DROP POLICY IF EXISTS "Exclusao de OAB monitorada do tenant" ON public.tenant_oab_monitoramentos;
CREATE POLICY "Exclusao de OAB monitorada do tenant"
  ON public.tenant_oab_monitoramentos
  FOR DELETE
  USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

CREATE TABLE IF NOT EXISTS public.process_movimentacoes_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  numero_cnj text NOT NULL,
  oab_estado text,
  oab_numero text,
  latest_data date,
  latest_conteudo text,
  latest_fonte text,
  latest_created_at timestamp with time zone,
  quantidade_eventos integer NOT NULL DEFAULT 0,
  movimentacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload_ultimo_evento jsonb,
  monitorado boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_process_movimentacoes_inbox_unique
  ON public.process_movimentacoes_inbox(tenant_id, numero_cnj);

CREATE INDEX IF NOT EXISTS idx_process_movimentacoes_inbox_tenant
  ON public.process_movimentacoes_inbox(tenant_id);

CREATE INDEX IF NOT EXISTS idx_process_movimentacoes_inbox_latest_created
  ON public.process_movimentacoes_inbox(tenant_id, latest_created_at DESC);

ALTER TABLE public.process_movimentacoes_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura da inbox de movimentacoes do tenant" ON public.process_movimentacoes_inbox;
CREATE POLICY "Leitura da inbox de movimentacoes do tenant"
  ON public.process_movimentacoes_inbox
  FOR SELECT
  USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

DROP POLICY IF EXISTS "Insercao da inbox de movimentacoes do tenant" ON public.process_movimentacoes_inbox;
CREATE POLICY "Insercao da inbox de movimentacoes do tenant"
  ON public.process_movimentacoes_inbox
  FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

DROP POLICY IF EXISTS "Atualizacao da inbox de movimentacoes do tenant" ON public.process_movimentacoes_inbox;
CREATE POLICY "Atualizacao da inbox de movimentacoes do tenant"
  ON public.process_movimentacoes_inbox
  FOR UPDATE
  USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

DROP POLICY IF EXISTS "Exclusao da inbox de movimentacoes do tenant" ON public.process_movimentacoes_inbox;
CREATE POLICY "Exclusao da inbox de movimentacoes do tenant"
  ON public.process_movimentacoes_inbox
  FOR DELETE
  USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);
