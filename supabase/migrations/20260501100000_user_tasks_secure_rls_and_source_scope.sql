CREATE OR REPLACE FUNCTION public.current_user_has_full_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
  user_is_superadmin boolean;
BEGIN
  user_role := public.get_current_user_role();

  SELECT COALESCE(is_superadmin, false)
  INTO user_is_superadmin
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN COALESCE(user_is_superadmin, false)
    OR user_role IN ('admin', 'socio', 'mayus_admin');
END;
$$;

DROP POLICY IF EXISTS "Users can view tasks from their tenant" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can insert tasks for their tenant" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can update tasks from their tenant" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can delete tasks from their tenant" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can view visible user_tasks" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can insert scoped user_tasks" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can update scoped user_tasks" ON public.user_tasks;
DROP POLICY IF EXISTS "Users can delete owned or admin user_tasks" ON public.user_tasks;

CREATE POLICY "Users can view visible user_tasks" ON public.user_tasks
  FOR SELECT USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      COALESCE(visibility, 'global') = 'global'
      OR assigned_to = auth.uid()
      OR created_by = auth.uid()
      OR completed_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert scoped user_tasks" ON public.user_tasks
  FOR INSERT WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND (
      (COALESCE(visibility, 'private') = 'global' AND public.current_user_has_full_access())
      OR (
        COALESCE(visibility, 'private') = 'private'
        AND (assigned_to = auth.uid() OR created_by = auth.uid())
      )
    )
  );

CREATE POLICY "Users can update scoped user_tasks" ON public.user_tasks
  FOR UPDATE USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      COALESCE(visibility, 'global') = 'global'
      OR assigned_to = auth.uid()
      OR created_by = auth.uid()
    )
  ) WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND (
      COALESCE(visibility, 'global') = 'global'
      OR assigned_to = auth.uid()
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete owned or admin user_tasks" ON public.user_tasks
  FOR DELETE USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR (COALESCE(visibility, 'global') = 'global' AND public.current_user_has_full_access())
    )
  );

DROP INDEX IF EXISTS public.idx_user_tasks_source_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tasks_tenant_source_unique
  ON public.user_tasks(tenant_id, source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;
