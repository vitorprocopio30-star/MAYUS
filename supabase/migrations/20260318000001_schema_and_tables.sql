-- ==============================================================================
-- 02_schema_and_tables.sql
-- Objetivo: Criar as tabelas principais do banco de dados MAYUS
-- Forçando isolamento através da coluna 'tenant_id' em absolutamente todas elas.
-- ==============================================================================

-- Habilita extensão de UUIDs padrão do PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Tenants (Escritórios)
CREATE TABLE public.tenants (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  cnpj text UNIQUE,
  plan_type text DEFAULT 'standard',
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Tabela de Perfis
-- Esta tabela amplia as informações cruas do auth.users
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('SDR', 'Advogado', 'Estagiário', 'Financeiro', 'Administrador', 'mayus_admin')),
  is_active boolean DEFAULT true,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now()
);

-- Atrelando o trigger de Inatividade criado no Passo 1
CREATE TRIGGER on_profile_deactivation
  AFTER UPDATE ON public.profiles
  FOR EACH ROW 
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.handle_inactive_user();

-- 3. Tabela de Casos Jurídicos (Protegida contra SDR/Financeiro/Suporte MAYUS)
CREATE TABLE public.cases (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  client_name text NOT NULL,
  case_number text,
  status text DEFAULT 'Análise',
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Tabela Associativa para Casos (Co-responsáveis)
-- Em vez de UUID[] Array, isso permite consultas JOIN extremamente mais rápidas e blindadas.
CREATE TABLE public.case_members (
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_role text DEFAULT 'Co-responsável', -- ex: 'Principal', 'Revisor', 'Co-responsável'
  PRIMARY KEY (case_id, user_id)
);

-- 5. Tabela de Financeiro (Visível Apenas para Financeiro / Admin)
CREATE TABLE public.financials (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL, -- Opcional: Atrelar faturamento a um caso
  amount numeric NOT NULL,
  asaas_invoice_id text,
  status text DEFAULT 'Pendente',
  due_date date,
  created_at timestamp with time zone DEFAULT now()
);

-- 6. Tabela de Leads / Pipeline CRM (Exclusivo SDR / Admin)
CREATE TABLE public.leads (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  contact_name text NOT NULL,
  phone text,
  pipeline_stage text DEFAULT 'Qualificação',
  created_at timestamp with time zone DEFAULT now()
);

-- 7. Convites de Usuários
-- Para gestão do fluxo "Admin Traz Novo Funcionário" com expiração de 48 horas.
CREATE TABLE public.invites (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role text NOT NULL,
  accepted boolean DEFAULT false,
  expires_at timestamp with time zone DEFAULT (now() + interval '48 hours'),
  created_at timestamp with time zone DEFAULT now()
);

-- Índice Crítico para Performance:
-- Acelera brutalmente o "WHERE tenant_id =" em consultas gigantes no Painel Admin MAYUS.
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX idx_cases_tenant ON public.cases(tenant_id);
CREATE INDEX idx_financials_tenant ON public.financials(tenant_id);
CREATE INDEX idx_leads_tenant ON public.leads(tenant_id);
CREATE INDEX idx_invites_tenant ON public.invites(tenant_id);
