-- ==============================================================================
-- 05_handle_new_user_trigger.sql
-- Objetivo: Sincronizar automaticamente a tabela 'auth.users' com a 'public.profiles'
-- Quando um convite é aceito, ou um usuário é criado, um perfil é instanciado.
-- ==============================================================================

-- Função de Inserção Automática
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_tenant_id uuid;
  v_role text;
  v_full_name text;
BEGIN
  -- Extraindo variaveis do raw_app_meta_data (onde gravaremos no envio do convite)
  v_tenant_id := (NEW.raw_app_meta_data->>'tenant_id')::uuid;
  v_role := COALESCE(NEW.raw_app_meta_data->>'role', 'SDR'); -- SDR como padrao caso falte
  
  -- Se houver full_name no user_meta (pode preencher na tela de setar senha) 
  -- Ou usa fallback genérico
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Membro Convidado');

  -- NOTA DE SEGURANÇA: No futuro, se for criar página de Cadastro Gratuito para Admins,
  -- será necessário criar um Tenant primeiro e então passar para a trigger, ou tornar
  -- o tenant_id nullable e criar depois.
  
  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, tenant_id, full_name, role, is_active)
    VALUES (
      NEW.id,
      v_tenant_id,
      v_full_name,
      v_role,
      true
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atrela o Gatilho à tabela interna auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
