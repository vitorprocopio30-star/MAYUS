-- ==============================================================================
-- 10_tenant_integrations.sql
-- Objetivo: Criar tabela para armazenar chaves de APIs (BYOK) e Webhooks do Cliente
-- ==============================================================================

CREATE TABLE public.tenant_integrations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL, -- ex: 'openai', 'anthropic', 'deepseek', 'openrouter', 'evolution_api', 'zapi'
  api_key text,
  webhook_url text,
  instance_name text,
  status text DEFAULT 'disconnected', -- 'connected', 'disconnected', 'pending'
  metadata jsonb, -- Campos extras ex: qrcode_url, session_id
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, provider) -- Um escritório só pode ter 1 registro de OpenAI, 1 zAPI etc.
);

-- Ativar RLS
ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- Apenas Administradores e Sócios podem gerenciar (ver, criar, alterar) as chaves
CREATE POLICY "Admins do Tenant gerenciam integrações" ON public.tenant_integrations
  FOR ALL USING (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (auth.jwt()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );

-- Function de Auto-Update para Atualizar timestamp
CREATE OR REPLACE FUNCTION public.handle_integrations_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_integration_update
  BEFORE UPDATE ON public.tenant_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_integrations_updated_at();
