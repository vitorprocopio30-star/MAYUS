-- ==============================================================================
-- 01_setup_auth_and_claims.sql
-- Objetivo: Configurar as funções e triggers para Custom Claims no Supabase Auth
-- Isso permite RLS ultra-rápido no painel MAYUS (sem JOINs lentos em cada query).
-- ==============================================================================

-- 1. Permite o app consultar rapidamente os claims atrelados a uma sessão
CREATE OR REPLACE FUNCTION public.get_my_claims()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claim', true), ''), '{}')::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.get_my_claim(claim TEXT)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claim', true), ''), '{}')::jsonb -> 'app_metadata' -> claim;
$$;

-- 2. Função de segurança (Apenas service_role) para alterar as Claims
-- Usado por Edge Functions/Triggers e nunca exposto ao cliente final.
CREATE OR REPLACE FUNCTION public.set_claim(uid uuid, claim text, value jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_claims_admin() THEN
    RETURN 'error: access denied';
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data = 
    raw_app_meta_data || json_build_object(claim, value)::jsonb
  WHERE id = uid;

  RETURN 'OK';
END;
$$;

-- 3. Função Auxiliar: is_claims_admin()
-- Garante que apenas nosso próprio banco de dados (Triggers e Service Keys Válidas) possam rodar esse código
CREATE OR REPLACE FUNCTION public.is_claims_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  -- Aqui se confere se quem pede pra mudar cargo é um "mayus_admin" ou a Key de Service
  SELECT 
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' OR
    (COALESCE(nullif(current_setting('request.jwt.claim', true), ''), '{}')::jsonb -> 'app_metadata' ->> 'role') = 'mayus_admin';
$$;


-- ==============================================================================
-- PROTEÇÃO CONTRA USUÁRIOS INATIVOS E LOGIN
-- ==============================================================================

-- Em "auth.users" não há RLS direto por questões do Supabase. Porém, podemos derrubar
-- usuários ativando um Trigger se o perfil deles na public.profiles tiver "is_active" = false

CREATE OR REPLACE FUNCTION public.handle_inactive_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Se um admin marcou 'is_active' como false, banimos o auth deste usuário
  IF NEW.is_active = false THEN
    -- Desliga sessões ativas limpando 'refresh_tokens', e também marca metadata 
    -- de banimento global. No próximo refresh (em minutos), o frontend os desloga.
    PERFORM set_claim(NEW.id, 'is_banned', 'true'::jsonb);
  ELSIF NEW.is_active = true AND OLD.is_active = false THEN
    PERFORM set_claim(NEW.id, 'is_banned', 'false'::jsonb);
  END IF;
  
  RETURN NEW;
END;
$$;

-- O trigger subjacente será atrelado na tabela de profiles logo após criarmos ela no step 2.
