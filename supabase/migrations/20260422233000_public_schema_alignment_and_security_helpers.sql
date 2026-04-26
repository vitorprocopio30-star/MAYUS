ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_permissions text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_corporativo text,
  ADD COLUMN IF NOT EXISTS oab_registro text,
  ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET custom_permissions = COALESCE(custom_permissions, '{}'::text[])
WHERE custom_permissions IS NULL;

UPDATE public.profiles
SET is_superadmin = COALESCE(is_superadmin, false)
WHERE is_superadmin IS NULL;

UPDATE public.profiles
SET role = CASE lower(translate(trim(COALESCE(role, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))
  WHEN 'administrador' THEN 'admin'
  WHEN 'admin' THEN 'admin'
  WHEN 'socio' THEN 'socio'
  WHEN 'advogado' THEN 'advogado'
  WHEN 'estagiario' THEN 'estagiario'
  WHEN 'financeiro' THEN 'financeiro'
  WHEN 'sdr' THEN 'sdr'
  WHEN 'mayus_admin' THEN 'mayus_admin'
  ELSE lower(translate(trim(COALESCE(role, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))
END
WHERE role IS DISTINCT FROM CASE lower(translate(trim(COALESCE(role, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))
  WHEN 'administrador' THEN 'admin'
  WHEN 'admin' THEN 'admin'
  WHEN 'socio' THEN 'socio'
  WHEN 'advogado' THEN 'advogado'
  WHEN 'estagiario' THEN 'estagiario'
  WHEN 'financeiro' THEN 'financeiro'
  WHEN 'sdr' THEN 'sdr'
  WHEN 'mayus_admin' THEN 'mayus_admin'
  ELSE lower(translate(trim(COALESCE(role, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))
END;

ALTER TABLE public.profiles
  ALTER COLUMN custom_permissions SET DEFAULT '{}'::text[],
  ALTER COLUMN custom_permissions SET NOT NULL,
  ALTER COLUMN is_superadmin SET DEFAULT false,
  ALTER COLUMN is_superadmin SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (
    role IN ('admin', 'socio', 'advogado', 'estagiario', 'financeiro', 'sdr', 'mayus_admin')
  );

ALTER TABLE public.process_tasks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.process_tasks
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.handle_process_tasks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_process_tasks_updated_at ON public.process_tasks;
CREATE TRIGGER tr_process_tasks_updated_at
  BEFORE UPDATE ON public.process_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_process_tasks_updated_at();

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims_tenant text;
  profile_tenant uuid;
BEGIN
  claims_tenant := COALESCE(
    get_my_claims()->'app_metadata'->>'tenant_id',
    auth.jwt()->'app_metadata'->>'tenant_id',
    ''
  );

  IF claims_tenant <> '' THEN
    BEGIN
      RETURN claims_tenant::uuid;
    EXCEPTION
      WHEN others THEN
        NULL;
    END;
  END IF;

  SELECT tenant_id
  INTO profile_tenant
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN profile_tenant;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_role text;
BEGIN
  raw_role := COALESCE(
    get_my_claims()->'app_metadata'->>'role',
    auth.jwt()->'app_metadata'->>'role',
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    ''
  );

  raw_role := lower(trim(raw_role));

  RETURN CASE raw_role
    WHEN 'administrador' THEN 'admin'
    WHEN 'admin' THEN 'admin'
    WHEN 'sócio' THEN 'socio'
    WHEN 'socio' THEN 'socio'
    WHEN 'advogado' THEN 'advogado'
    WHEN 'estagiário' THEN 'estagiario'
    WHEN 'estagiario' THEN 'estagiario'
    WHEN 'financeiro' THEN 'financeiro'
    WHEN 'sdr' THEN 'sdr'
    WHEN 'mayus_admin' THEN 'mayus_admin'
    ELSE raw_role
  END;
END;
$$;
