CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_tenant_id uuid;
  v_role text;
  v_full_name text;
BEGIN
  v_tenant_id := (NEW.raw_app_meta_data->>'tenant_id')::uuid;
  v_role := lower(trim(COALESCE(NEW.raw_app_meta_data->>'role', 'sdr')));

  v_role := CASE v_role
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
    ELSE 'sdr'
  END;

  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Membro Convidado');

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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
