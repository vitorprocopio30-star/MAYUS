-- ==============================================================================
-- 06_clients_rls_and_audit.sql
-- Objetivo: Criar tabela de clientes, membros do cliente, RLS e auditoria
-- ==============================================================================

-- 1. Criação das Tabelas
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('PF', 'PJ')),
  document text NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  origin text,
  status text DEFAULT 'Prospecção',
  rg_ie text,
  birth_or_foundation date,
  profession text,
  nationality text,
  marital_status text,
  address jsonb,
  bank_details jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, document)
);

CREATE TABLE IF NOT EXISTS public.client_members (
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'Responsável',
  PRIMARY KEY (client_id, user_id)
);

-- Tabela de Auditoria (Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON public.clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id);

-- 2. Habilitação de RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS - CLIENTS
-- Admins/Sócios veem e editam tudo no seu tenant
CREATE POLICY "Admins e Sócios veem todos os clientes do Tenant" ON public.clients
  FOR ALL USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );

-- Advogados veem todos os clientes do Tenant (para checar duplicidades)
CREATE POLICY "Advogados veem todos clientes do Tenant" ON public.clients
  FOR SELECT USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Advogado', 'Estagiário')
  );

-- Advogados só editam clientes se estiverem em client_members
CREATE POLICY "Advogados editam apenas seus clientes vinculados" ON public.clients
  FOR UPDATE USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Advogado', 'Estagiário') AND
    EXISTS (
      SELECT 1 FROM public.client_members 
      WHERE client_id = public.clients.id AND user_id = auth.uid()
    )
  );

-- Todo staff pode INSERIR clientes novos
CREATE POLICY "Staff pode criar clientes" ON public.clients
  FOR INSERT WITH CHECK (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

-- 4. Políticas RLS - CLIENT MEMBERS
CREATE POLICY "Acesso livre a records de client_members do tenant" ON public.client_members
  FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE public.profiles.id = user_id 
        AND (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = public.profiles.tenant_id
    )
  );

-- 5. Trigger de Auditoria para campos sensíveis (Banco, Email, Telefone)
CREATE OR REPLACE FUNCTION public.audit_clients_sensitive_data()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.bank_details IS DISTINCT FROM NEW.bank_details OR 
     OLD.email IS DISTINCT FROM NEW.email OR 
     OLD.phone IS DISTINCT FROM NEW.phone THEN
     
     INSERT INTO public.audit_logs (tenant_id, table_name, record_id, action, old_data, new_data, changed_by)
     VALUES (
       NEW.tenant_id, 
       'clients', 
       NEW.id, 
       'UPDATE_SENSITIVE', 
       jsonb_build_object('bank_details', OLD.bank_details, 'email', OLD.email, 'phone', OLD.phone),
       jsonb_build_object('bank_details', NEW.bank_details, 'email', NEW.email, 'phone', NEW.phone),
       auth.uid()
     );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_clients ON public.clients;
CREATE TRIGGER trg_audit_clients
  AFTER UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_clients_sensitive_data();

-- 6. Storage Bucket (Docs do Cliente)
-- Cria o bucket privado "client_docs" se não existir.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('client_docs', 'client_docs', false) 
ON CONFLICT (id) DO NOTHING;

-- Protege o acesso aos documentos limitando pelo TenantID na pasta raiz (ex: /tenant_id/client_id/doc.pdf)
CREATE POLICY "Acesso a documentos apenas do proprio tenant" ON storage.objects
  FOR ALL USING (
    bucket_id = 'client_docs' AND 
    (auth.jwt()->'app_metadata'->>'tenant_id') = (string_to_array(name, '/'))[1]
  );
