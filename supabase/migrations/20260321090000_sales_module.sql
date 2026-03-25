-- ==============================================================================
-- 11_sales_module.sql
-- Objetivo: Criar tabelas para registro focado de Vendas e Comissões (Closer/SDR)
-- ==============================================================================

CREATE TABLE public.sales (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  client_name text NOT NULL,
  professional_id uuid REFERENCES auth.users(id),
  professional_name text, -- fallback caso seja externo
  career_plan text, -- ex: 'Junior', 'Pleno', 'Senior', 'Sócio'
  ticket_total numeric DEFAULT 0,
  installments integer DEFAULT 1,
  contract_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'Fechado', -- 'Fechado', 'Pendente', etc
  commission_value numeric DEFAULT 0,
  fixed_salary numeric DEFAULT 0,
  estimated_earnings numeric DEFAULT 0,
  sale_number_month integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- RLS Segurança
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendas visiveis para o tenant" ON public.sales
  FOR SELECT USING (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

CREATE POLICY "Criar Vendas no tenant" ON public.sales
  FOR INSERT WITH CHECK (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

CREATE POLICY "Atualizar Vendas" ON public.sales
  FOR UPDATE USING (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

CREATE POLICY "Somente admin exclui venda" ON public.sales
  FOR DELETE USING (
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (auth.jwt()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );
