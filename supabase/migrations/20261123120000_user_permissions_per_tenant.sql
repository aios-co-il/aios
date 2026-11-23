-- AIO-573: module permissions per tenant.
--
-- user_permissions had no tenant_id, so one row applied in every tenant the
-- user is in: opening a module for someone in one organization opened it in
-- all of them, and replacing a user's modules in one wiped the others.
--
-- 1. tenant_id (cascade with the tenant), and the unique key becomes
--    (user_id, tenant_id, module).
-- 2. Backfill keeps today's access: every existing row is copied to each
--    tenant the user is a member of or inactive in (a reactivated member gets
--    them back); the tenant-less originals are removed.
-- 3. has_finance_permission / has_finance_write_permission read the module
--    in the user's active tenant, the tenant the finance policies compare.
-- 4. handle_new_user grants the invitation's modules in the invited tenant;
--    merge_orphan_profile_by_email copies them per tenant.
-- 5. Policies: an owner reads and writes only rows of a tenant they own, and
--    writes only for members of that tenant; super admins any; users read
--    their own. The tenant-less "any owner reads every row" and "users read
--    what they can manage" reads are dropped.
--
-- Triggers fired: update_user_permissions_updated_at does not fire (the
-- backfill inserts and deletes; it updates nothing).

ALTER TABLE public.user_permissions
  ADD COLUMN tenant_id uuid REFERENCES public.tenants (id) ON DELETE CASCADE;

ALTER TABLE public.user_permissions
  DROP CONSTRAINT user_permissions_user_id_module_key;

DO $$
DECLARE
  v_original integer;
  v_copied integer;
  v_tenantless_users integer;
BEGIN
  SELECT count(*) INTO v_original FROM public.user_permissions;
  SELECT count(DISTINCT up.user_id) INTO v_tenantless_users
  FROM public.user_permissions up
  WHERE NOT EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = up.user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.tenant_inactive_members m
      WHERE m.user_id = up.user_id AND m.status = 'inactive'
    );

  INSERT INTO public.user_permissions (user_id, tenant_id, module, can_access, created_at, updated_at)
  SELECT up.user_id, t.tenant_id, up.module, up.can_access, up.created_at, up.updated_at
  FROM public.user_permissions up
  JOIN (
    SELECT user_id, tenant_id FROM public.tenant_users
    UNION
    SELECT user_id, tenant_id FROM public.tenant_inactive_members WHERE status = 'inactive'
  ) t ON t.user_id = up.user_id
  WHERE up.tenant_id IS NULL;
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  DELETE FROM public.user_permissions WHERE tenant_id IS NULL;

  RAISE NOTICE 'user_permissions: % rows became % per-tenant rows; % users with no tenant lost theirs',
    v_original, v_copied, v_tenantless_users;
END
$$;

ALTER TABLE public.user_permissions
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT user_permissions_user_tenant_module_key UNIQUE (user_id, tenant_id, module);

-- Serves the tenant cascade and the per-tenant owner policies.
CREATE INDEX user_permissions_tenant_id_idx ON public.user_permissions (tenant_id);

-- Read finance: owner, super admin, or finance / finance_view in the active tenant.
CREATE OR REPLACE FUNCTION public.has_finance_permission(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select public.has_finance_write_permission(_user_id)
    or exists (
      select 1
      from public.user_permissions
      where user_id = _user_id
        and tenant_id = public.get_user_tenant_id(_user_id)
        and module = 'finance_view'
        and can_access
    )
$function$;

-- Write finance: owner, super admin, or finance in the active tenant.
CREATE OR REPLACE FUNCTION public.has_finance_write_permission(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select public.has_role(_user_id, 'owner'::public.app_role)
    or public.is_super_admin(_user_id)
    or exists (
      select 1
      from public.user_permissions
      where user_id = _user_id
        and tenant_id = public.get_user_tenant_id(_user_id)
        and module = 'finance'
        and can_access
    )
$function$;

-- New auth user: profile, orphan merge, and the open invitation's tenant, role and modules.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv    public.invitation_tokens%ROWTYPE;
  v_meta   jsonb;
  v_role   text;
  v_tenant uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'active')
  ON CONFLICT (id) DO NOTHING;

  -- Merge any pre-provisioned orphan profile with the same email.
  BEGIN
    PERFORM public.merge_orphan_profile_by_email(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user orphan merge failed for %: %', NEW.email, SQLERRM;
  END;

  BEGIN
    -- Only an invitation still open: a used or expired one (for example the
    -- one a deleted user once accepted) never links a new account.
    SELECT * INTO v_inv
    FROM public.invitation_tokens
    WHERE lower(email) = lower(NEW.email)
      AND NOT used
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_inv.id IS NOT NULL AND v_inv.tenant_id IS NOT NULL THEN
      v_meta   := COALESCE(v_inv.metadata, '{}'::jsonb);
      v_role   := NULLIF(v_meta->>'role', '');
      v_tenant := v_inv.tenant_id;

      INSERT INTO public.tenant_users (user_id, tenant_id, role)
      SELECT NEW.id, v_tenant, COALESCE(v_role, 'member')
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE user_id = NEW.id AND tenant_id = v_tenant
      );

      INSERT INTO public.user_active_tenant (user_id, tenant_id)
      SELECT NEW.id, v_tenant
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_active_tenant WHERE user_id = NEW.id
      );

      IF v_role IS NOT NULL THEN
        BEGIN
          INSERT INTO public.user_roles (user_id, role, tenant_id)
          VALUES (NEW.id, v_role::public.app_role, v_tenant)
          ON CONFLICT (user_id, role, tenant_id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'handle_new_user: bad role % for %: %', v_role, NEW.email, SQLERRM;
        END;
      END IF;

      IF jsonb_typeof(v_meta->'modulePermissions') = 'array' THEN
        INSERT INTO public.user_permissions (user_id, tenant_id, module, can_access)
        SELECT NEW.id, v_tenant, m.value, true
        FROM jsonb_array_elements_text(v_meta->'modulePermissions') AS m(value)
        ON CONFLICT (user_id, tenant_id, module) DO NOTHING;
      END IF;

      IF NULLIF(v_meta->>'campaignerId', '') IS NOT NULL THEN
        UPDATE public.profiles SET campaigner_id = (v_meta->>'campaignerId')::uuid WHERE id = NEW.id;
      END IF;
      IF NULLIF(v_meta->>'salesPersonId', '') IS NOT NULL THEN
        UPDATE public.profiles SET sales_person_id = (v_meta->>'salesPersonId')::uuid WHERE id = NEW.id;
      END IF;
    ELSE
      RAISE NOTICE 'handle_new_user: no open invitation for %', NEW.email;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user auto-link failed for %: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- Moves a pre-provisioned orphan profile's links, memberships, roles and per-tenant modules to the real user.
CREATE OR REPLACE FUNCTION public.merge_orphan_profile_by_email(_auth_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_orphan_id uuid;
BEGIN
  IF _auth_user_id IS NULL OR NULLIF(trim(_email), '') IS NULL THEN
    RETURN;
  END IF;

  SELECT p.id
  INTO v_orphan_id
  FROM public.profiles p
  WHERE lower(p.email) = lower(_email)
    AND p.id <> _auth_user_id
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
  LIMIT 1;

  IF v_orphan_id IS NULL THEN
    RETURN;
  END IF;

  -- Copy team-member links onto the real auth profile.
  UPDATE public.profiles dst
  SET
    full_name = COALESCE(NULLIF(dst.full_name, ''), src.full_name),
    campaigner_id = COALESCE(dst.campaigner_id, src.campaigner_id),
    sales_person_id = COALESCE(dst.sales_person_id, src.sales_person_id),
    phone = COALESCE(dst.phone, src.phone),
    avatar_url = COALESCE(dst.avatar_url, src.avatar_url),
    ui_mode = COALESCE(dst.ui_mode, src.ui_mode),
    status = 'active',
    updated_at = now()
  FROM public.profiles src
  WHERE dst.id = _auth_user_id
    AND src.id = v_orphan_id;

  INSERT INTO public.tenant_users (user_id, tenant_id, role)
  SELECT _auth_user_id, tu.tenant_id, tu.role
  FROM public.tenant_users tu
  WHERE tu.user_id = v_orphan_id
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  SELECT _auth_user_id, ur.role, ur.tenant_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_orphan_id
  ON CONFLICT (user_id, role, tenant_id) DO NOTHING;

  INSERT INTO public.user_permissions (user_id, tenant_id, module, can_access)
  SELECT _auth_user_id, up.tenant_id, up.module, up.can_access
  FROM public.user_permissions up
  WHERE up.user_id = v_orphan_id
  ON CONFLICT (user_id, tenant_id, module) DO UPDATE
    SET can_access = EXCLUDED.can_access;

  INSERT INTO public.user_active_tenant (user_id, tenant_id, updated_at)
  SELECT _auth_user_id, uat.tenant_id, now()
  FROM public.user_active_tenant uat
  WHERE uat.user_id = v_orphan_id
  ON CONFLICT (user_id) DO NOTHING;

  DELETE FROM public.user_permissions WHERE user_id = v_orphan_id;
  DELETE FROM public.user_roles WHERE user_id = v_orphan_id;
  DELETE FROM public.tenant_users WHERE user_id = v_orphan_id;
  DELETE FROM public.user_active_tenant WHERE user_id = v_orphan_id;
  DELETE FROM public.profiles WHERE id = v_orphan_id;
END;
$function$;

-- Caller may set this user's modules in this tenant: a super admin, or an owner of the tenant the user is a member of.
CREATE OR REPLACE FUNCTION public.caller_manages_tenant_permissions(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  select public.is_super_admin(auth.uid())
    or (
      public.caller_owns_tenant(_tenant_id)
      and exists (
        select 1
        from public.tenant_users tu
        where tu.user_id = _user_id
          and tu.tenant_id = _tenant_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.caller_manages_tenant_permissions(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caller_manages_tenant_permissions(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Owners can view all permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Users can view permissions they can manage" ON public.user_permissions;
DROP POLICY IF EXISTS "Owners or super admins insert permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Owners or super admins update permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Owners or super admins delete permissions" ON public.user_permissions;

-- An owner reads the permissions of the tenants it owns.
CREATE POLICY "Owners view permissions of their tenants"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (public.caller_owns_tenant(tenant_id));

-- A super admin grants anyone; an owner grants members of a tenant it owns, in that tenant.
CREATE POLICY "Owners or super admins insert permissions"
ON public.user_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.caller_manages_tenant_permissions(user_id, tenant_id));

-- The same rule before and after, so a row cannot move to another user or tenant.
CREATE POLICY "Owners or super admins update permissions"
ON public.user_permissions
FOR UPDATE
TO authenticated
USING (public.caller_manages_tenant_permissions(user_id, tenant_id))
WITH CHECK (public.caller_manages_tenant_permissions(user_id, tenant_id));

-- A super admin removes anyone's; an owner removes those of its tenant's members, in that tenant.
CREATE POLICY "Owners or super admins delete permissions"
ON public.user_permissions
FOR DELETE
TO authenticated
USING (public.caller_manages_tenant_permissions(user_id, tenant_id));
