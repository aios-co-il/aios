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
-- active tenant when that row is deleted). A user_roles row alone does not
-- count: its insert policy is not scoped to a tenant. agency_tenant_access and
-- user_managed_agencies give access in place and never switch the tenant.
--
-- Super admins read every row and may make any tenant their active one: that
-- is how they choose the tenant they act in, and the only super-admin branch
-- on a write here. Like everyone else they write only their own row.
--
-- A trigger applies the same rule to every writer, the service role included
-- (invitations and signup add tenant_users first), and losing the super_admin
-- role clears an active tenant the user does not belong to.
--
-- get_user_tenant_id and get_effective_tenant_id are left as they are: a
-- membership check in them measured 1.7-3x per call, and they run per row in
-- hundreds of policies. The write rules above keep their input valid.

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
DROP POLICY IF EXISTS user_active_tenant_select ON public.user_active_tenant;
DROP POLICY IF EXISTS user_active_tenant_insert ON public.user_active_tenant;
DROP POLICY IF EXISTS user_active_tenant_update ON public.user_active_tenant;
DROP POLICY IF EXISTS user_active_tenant_delete ON public.user_active_tenant;

-- Read: a user sees their own choice; a super admin sees everyone's.
CREATE POLICY user_active_tenant_select ON public.user_active_tenant
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_super_admin((select auth.uid())));

-- Insert: own row, pointing at a tenant the user belongs to (super admin: any).
CREATE POLICY user_active_tenant_insert ON public.user_active_tenant
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND (public.user_is_tenant_member(tenant_id) OR public.is_super_admin((select auth.uid())))
  );

-- Update: own row, and the new tenant must pass the same membership check.
CREATE POLICY user_active_tenant_update ON public.user_active_tenant
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid())
    AND (public.user_is_tenant_member(tenant_id) OR public.is_super_admin((select auth.uid())))
  );

-- Delete: own row only.
CREATE POLICY user_active_tenant_delete ON public.user_active_tenant
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- Refuses a row whose tenant the user neither belongs to nor, as a super
-- admin, may choose; runs for every writer, RLS-exempt ones included.
CREATE OR REPLACE FUNCTION public.user_active_tenant_require_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- The app saves the same tenant again on every page load.
    IF NEW.user_id = OLD.user_id AND NEW.tenant_id = OLD.tenant_id THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = NEW.user_id AND tu.tenant_id = NEW.tenant_id
    )
    OR public.is_super_admin(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'active tenant must be a tenant the user belongs to'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE ALL ON FUNCTION public.user_active_tenant_require_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_active_tenant_require_member() TO authenticated, service_role;

DROP TRIGGER IF EXISTS user_active_tenant_require_member ON public.user_active_tenant;
CREATE TRIGGER user_active_tenant_require_member
  BEFORE INSERT OR UPDATE ON public.user_active_tenant
  FOR EACH ROW EXECUTE FUNCTION public.user_active_tenant_require_member();

-- When a super_admin role row is deleted or changed and the user is no
-- longer a super admin, deletes their active tenant unless they belong to it.
CREATE OR REPLACE FUNCTION public.clear_active_tenant_after_super_admin_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    DELETE FROM public.user_active_tenant uat
    WHERE uat.user_id = OLD.user_id
      AND NOT public.is_super_admin(OLD.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.user_id = uat.user_id AND tu.tenant_id = uat.tenant_id
      );
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_active_tenant_after_super_admin_loss() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_active_tenant_after_super_admin_loss() TO authenticated, service_role;

DROP TRIGGER IF EXISTS user_roles_clear_active_tenant ON public.user_roles;
CREATE TRIGGER user_roles_clear_active_tenant
  AFTER DELETE OR UPDATE OF role, tenant_id, user_id ON public.user_roles
  FOR EACH ROW
  WHEN (OLD.role = 'super_admin'::public.app_role AND OLD.tenant_id IS NULL)
  EXECUTE FUNCTION public.clear_active_tenant_after_super_admin_loss();

-- Closing guard: policies are permissive and OR together, so any policy left
-- beside these four, or one granted to another role, would widen access.
DO $$
DECLARE
  v_names text[];
  v_bad integer;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.user_active_tenant'::regclass) THEN
    RAISE EXCEPTION 'active_tenant_membership: RLS is off on public.user_active_tenant';
  END IF;

  SELECT array_agg(p.policyname::text ORDER BY p.policyname) INTO v_names
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'user_active_tenant';
  IF v_names IS DISTINCT FROM ARRAY[
    'user_active_tenant_delete', 'user_active_tenant_insert',
    'user_active_tenant_select', 'user_active_tenant_update'
  ] THEN
    RAISE EXCEPTION 'active_tenant_membership: unexpected policies on public.user_active_tenant: %', v_names;
  END IF;

  SELECT count(*) INTO v_bad
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'user_active_tenant'
    AND (p.roles <> ARRAY['authenticated']::name[] OR p.permissive <> 'PERMISSIVE');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'active_tenant_membership: % policy(ies) on public.user_active_tenant are not permissive for authenticated only', v_bad;
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = 'public.user_active_tenant'::regclass
        AND t.tgname = 'user_active_tenant_require_member' AND t.tgenabled = 'O'
    ) THEN
    RAISE EXCEPTION 'active_tenant_membership: trigger user_active_tenant_require_member is missing';
  END IF;
END
$$;
