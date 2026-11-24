-- Module permissions per tenant (20261123120000_user_permissions_per_tenant):
-- a module opened in one tenant is not opened in another, finance follows
-- the active tenant, an owner reads and writes only its own tenants' rows,
-- and an invitation grants its modules in the invited tenant. Staging only:
-- the test's own users and tenants, and a full rollback.
BEGIN;
DO $test$
DECLARE
  owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid();
  both_member uuid := gen_random_uuid(); invited uuid := gen_random_uuid();
  t_a uuid; t_b uuid;
  seen integer; affected integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-perm-tenant-' || u || '@example.invalid'
  FROM unnest(ARRAY[owner_a, owner_b, both_member]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK perms A', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK perms B', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_b;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (t_a, owner_a, 'owner'), (t_b, owner_b, 'owner'),
    (t_a, both_member, 'member'), (t_b, both_member, 'member');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (owner_a, 'owner', t_a), (owner_b, 'owner', t_b),
    (both_member, 'team_manager', t_a), (both_member, 'sales_person', t_b);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (owner_a, t_a), (owner_b, t_b), (both_member, t_a)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;

  -- The same module can be set separately in each tenant.
  INSERT INTO public.user_permissions (user_id, tenant_id, module, can_access) VALUES
    (both_member, t_a, 'finance', true),
    (both_member, t_a, 'clients', true),
    (both_member, t_b, 'clients', false);

  -- Finance follows the active tenant.
  IF NOT public.has_finance_write_permission(both_member) THEN
    RAISE EXCEPTION 'finance granted in the active tenant is not honoured';
  END IF;
  UPDATE public.user_active_tenant SET tenant_id = t_b WHERE user_id = both_member;
  IF public.has_finance_write_permission(both_member) OR public.has_finance_permission(both_member) THEN
    RAISE EXCEPTION 'finance granted in A applies while the user works in B';
  END IF;

  -- Owner of A sees and changes only A's rows.
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen FROM public.user_permissions WHERE user_id = both_member;
  IF seen <> 2 THEN
    RAISE EXCEPTION 'An owner sees % of the user''s rows, not only its tenant''s 2', seen;
  END IF;
  BEGIN
    INSERT INTO public.user_permissions (user_id, tenant_id, module, can_access)
    VALUES (both_member, t_b, 'leads', true);
    RAISE EXCEPTION 'An owner can grant a module in a tenant it does not own';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.user_permissions SET can_access = true WHERE user_id = both_member AND tenant_id = t_b;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'An owner can change another tenant''s modules'; END IF;
  INSERT INTO public.user_permissions (user_id, tenant_id, module, can_access)
  VALUES (both_member, t_a, 'leads', true);
  RESET ROLE;

  -- The user reads all of its own rows.
  PERFORM set_config('request.jwt.claim.sub', both_member::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen FROM public.user_permissions WHERE user_id = both_member;
  IF seen <> 4 THEN RAISE EXCEPTION 'A user sees % of its own 4 rows', seen; END IF;
  RESET ROLE;

  IF (SELECT can_access FROM public.user_permissions
      WHERE user_id = both_member AND tenant_id = t_b AND module = 'clients') THEN
    RAISE EXCEPTION 'B''s module changed through A';
  END IF;

  -- An invitation grants its modules in the invited tenant only.
  INSERT INTO public.invitation_tokens (token, tenant_id, created_by, email, metadata)
  VALUES (gen_random_uuid()::text, t_b, owner_b, 'qa-perm-invited-' || invited || '@example.invalid',
          '{"role": "sales_person", "modulePermissions": ["leads", "chat"]}');
  INSERT INTO auth.users (id, email)
  VALUES (invited, 'qa-perm-invited-' || invited || '@example.invalid');
  IF (SELECT count(*) FROM public.user_permissions WHERE user_id = invited AND tenant_id = t_b) <> 2
    OR EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = invited AND tenant_id <> t_b) THEN
    RAISE EXCEPTION 'An invitation''s modules did not land in the invited tenant only';
  END IF;
END;
$test$;
SELECT 'Module permissions are per tenant: finance follows the active tenant, owners see and write their tenants only, invitations grant in the invited tenant' AS result;
ROLLBACK;
