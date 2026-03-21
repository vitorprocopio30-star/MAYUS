-- ==============================================================================
-- 04_audit_and_notifications.sql
-- Objetivo: Criar tabelas e triggers para o sistema nervoso de Logs e Alertas.
-- ==============================================================================

-- 1. Criação da Tabela de Logs de Auditoria (Brute Force, Acessos, Mudanças)
CREATE TABLE public.audit_logs (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, 
    action text NOT NULL, -- ex: 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'ROLE_CHANGED', 'UNAUTHORIZED_ACCESS'
    entity text, -- ex: 'auth', 'cases', 'profiles'
    target_id uuid, -- id do recurso modificado ou afetado
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Criação da Tabela de Notificações In-App (Push Dashboard)
CREATE TABLE public.notifications (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- nulo = brodcast pro tenant inteiro
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info', -- 'alert', 'success', 'warning'
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Ativa o Realtime para o front-end ouvir as notificações caindo instantaneamente!
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 3. Habilitação de Segurança (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Somente Administradores ou Sócios podem ler a Auditoria
CREATE POLICY "Admins podem ver auditoria do tenant" ON public.audit_logs
  FOR SELECT USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (get_my_claims()->'app_metadata'->>'role') IN ('Administrador', 'Sócio')
  );

-- O App autenticado pode Inserir o log de suas navegações
CREATE POLICY "Autenticado loga ações do tenant" ON public.audit_logs
  FOR INSERT WITH CHECK (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

-- Usuário loga os próprios avisos (In-App Push)
CREATE POLICY "Usuários veem próprias notificações" ON public.notifications
  FOR SELECT USING (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id AND
    (user_id = auth.uid() OR user_id IS NULL)
  );

CREATE POLICY "Usuáriosatualizam próprias notificações" ON public.notifications
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- Permitir inserts internos de notificações
CREATE POLICY "Inserção interna de notificações" ON public.notifications
  FOR INSERT WITH CHECK (
    (get_my_claims()->'app_metadata'->>'tenant_id')::uuid = tenant_id
  );

-- 4. TRIGGER de Auditoria: Loga MUDANÇAS de NÍVEL DE ACESSO automaticamente
CREATE OR REPLACE FUNCTION public.log_profile_role_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity, target_id, old_data, new_data)
    VALUES (
      NEW.tenant_id,
      auth.uid(), -- Capta o admin que alterou (via auth.uid context)
      CASE WHEN OLD.is_active IS DISTINCT FROM NEW.is_active THEN 'STATUS_CHANGED' ELSE 'ROLE_CHANGED' END,
      'profiles',
      NEW.id,
      jsonb_build_object('role', OLD.role, 'is_active', OLD.is_active),
      jsonb_build_object('role', NEW.role, 'is_active', NEW.is_active)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_role_update
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_role_change();
