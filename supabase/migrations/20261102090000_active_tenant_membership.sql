-- Active tenant: a user switches only into a tenant they belong to.
--
-- Before this, any signed-in user could upsert their user_active_tenant row
-- with any tenant_id. get_user_tenant_id and get_effective_tenant_id return
-- that row with no membership check, so every policy written on them opened
-- the other tenant's data.
--
-- Membership is the rule the app already uses to offer and open a tenant: a
-- tenant_users row (list-user-tenants, the sidebar switcher, the tenants
-- SELECT policy that resolves /t/<slug>, and the trigger that clears the
-- active tenant when that row is deleted). Super admins may switch into any
-- tenant. A user_roles row alone does not count: its insert policy is not
-- scoped to a tenant. agency_tenant_access and user_managed_agencies give
-- access in place and never switch the tenant. Service-role writers
-- (invitations, signup) bypass RLS as before and add tenant_users first.
--
-- get_user_tenant_id and get_effective_tenant_id are left as they are: a
-- membership check in them measured 1.7-3x per call, and they run per row in
-- hundreds of policies.

-- Rows the new rule would refuse. Data is left unchanged.
DO $$
DECLARE
  v_refused integer;
BEGIN
  SELECT count(*) INTO v_refused
  FROM public.user_active_tenant uat
  WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = uat.user_id AND tu.tenant_id = uat.tenant_id
    )
    AND NOT public.is_super_admin(uat.user_id);
  RAISE NOTICE 'active_tenant_membership: % user_active_tenant row(s) point at a tenant the user could not switch to now; left unchanged', v_refused;
END
$$;

DROP POLICY IF EXISTS "Users manage own active_tenant" ON public.user_active_tenant;
DROP POLICY IF EXISTS "Users manage own active tenant" ON public.user_active_tenant;
DROP POLICY IF EXISTS "Users read own active tenant" ON public.user_active_tenant;
DROP POLICY IF EXISTS "Super admins see all active_tenant" ON public.user_active_tenant;
DROP POLICY IF EXISTS "Active tenant read own or super admin" ON public.user_active_tenant;
DROP POLICY IF EXISTS "Active tenant insert own member tenant" ON public.user_active_tenant;
DROP POLICY IF EXISTS "Active tenant update own member tenant" ON public.user_active_tenant;
DROP POLICY IF EXISTS "Active tenant delete own" ON public.user_active_tenant;

-- Read: a user sees their own choice; a super admin sees everyone's.
CREATE POLICY "Active tenant read own or super admin" ON public.user_active_tenant
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- Insert: own row, pointing at a tenant the user belongs to (super admin: any).
CREATE POLICY "Active tenant insert own member tenant" ON public.user_active_tenant
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.user_is_tenant_member(tenant_id) OR public.is_super_admin(auth.uid()))
  );

-- Update: own row, and the new tenant must pass the same membership check.
CREATE POLICY "Active tenant update own member tenant" ON public.user_active_tenant
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (public.user_is_tenant_member(tenant_id) OR public.is_super_admin(auth.uid()))
  );

-- Delete: own row only.
CREATE POLICY "Active tenant delete own" ON public.user_active_tenant
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
