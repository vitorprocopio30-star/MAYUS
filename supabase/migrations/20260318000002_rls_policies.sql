-- ==============================================================================
-- 03_rls_policies.sql
-- Objetivo: Restringir o acesso a todas as tabelas
-- ==============================================================================

-- 0. Habilitação de RLS em todas as tabelas
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- 1. PROFILES (Perfis) =========================================================

CREATE POLICY "Admins controlam seu tenant" ON public.profiles
  FOR ALL USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );

CREATE POLICY "Suporte MAYUS vê apenas perfis e métricas" ON public.profiles
  FOR SELECT USING (
    (get_my_claims()->'app_metadata'->>'role') = 'mayus_admin'
  );

CREATE POLICY "Leitura básica de colegas do escritório" ON public.profiles
  FOR SELECT USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND is_active = true
  );

CREATE POLICY "Update próprio" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id AND is_active = true
  );

-- 2. CASOS JURÍDICOS E MEMBROS (Protegidos) =====================================

CREATE POLICY "Admins e Sócios veem todos os casos do Tenant" ON public.cases
  FOR ALL USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );

CREATE POLICY "Advogados vêem casos onde estão associados" ON public.cases
  FOR SELECT USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Advogado', 'Estagiário') AND
    EXISTS (
      SELECT 1 FROM public.case_members 
      WHERE case_id = public.cases.id AND user_id = auth.uid()
    )
  );
  
CREATE POLICY "Advogados/Estagiários vinculação livre" ON public.case_members
    FOR ALL USING (
      user_id = auth.uid()
    );

-- 3. FINANCEIRO (Protegido contra SDR e Advogados) ==============================

CREATE POLICY "Financeiro e Admins gerenciam valores" ON public.financials
  FOR ALL USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Administrador', 'Sócio', 'Financeiro')
  );

-- 4. PIPELINE DE VENDAS e CRM (SDR) =============================================

CREATE POLICY "SDR e Admin gerenciam pipelines" ON public.leads
  FOR ALL USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Administrador', 'Sócio', 'SDR')
  );

-- 5. CONVITES ============================

CREATE POLICY "Apenas Admins gerenciam convites" ON public.invites
  FOR ALL USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );
