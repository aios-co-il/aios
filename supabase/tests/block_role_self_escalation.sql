-- Role and permission grants (20261102113500_block_role_self_escalation):
-- an owner grants roles, permissions and invitations only in a tenant they
-- own and never super_admin; super_admin is global and only a super admin or
-- the server grants it; clients cannot call merge_orphan_profile_by_email or
-- assign_role_by_email. Staging only: the test's own users and tenants, and a
-- full rollback.
BEGIN;
DO $test$
DECLARE
  owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid();
  member_a uuid := gen_random_uuid(); admin uuid := gen_random_uuid();
  target_a uuid := gen_random_uuid(); target_b uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  t_a uuid; t_b uuid;
  own_role_a uuid; own_role_b uuid; target_b_role uuid; token_a uuid;
  affected integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-roles-' || u || '@example.invalid'
  FROM unnest(ARRAY[owner_a, owner_b, member_a, admin, target_a, target_b, outsider]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK A', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK B', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_b;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (t_a, owner_a, 'owner'), (t_a, member_a, 'member'), (t_a, target_a, 'member'),
    (t_b, owner_b, 'owner'), (t_b, target_b, 'member');
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (owner_a, t_a), (owner_b, t_b), (member_a, t_a)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (owner_a, 'owner', t_a), (owner_b, 'owner', t_b),
    (member_a, 'campaigner', t_a), (admin, 'super_admin', NULL);
  -- owner_a also works as a campaigner in A and in B, where it is no owner.
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (owner_a, 'campaigner', t_a) RETURNING id INTO own_role_a;
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (owner_a, 'campaigner', t_b) RETURNING id INTO own_role_b;
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (target_b, 'campaigner', t_b) RETURNING id INTO target_b_role;
  INSERT INTO public.user_permissions (user_id, module, can_access)
  VALUES (target_b, 'finance', false);
  INSERT INTO public.invitation_tokens (token, tenant_id, created_by, email, metadata)
  VALUES (gen_random_uuid()::text, t_a, owner_a, 'qa-invite@example.invalid', '{"role": "campaigner"}')
  RETURNING id INTO token_a;

  -- Owner of A.
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (owner_a, 'super_admin', NULL);
    RAISE EXCEPTION 'An owner can make itself a global super admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (owner_a, 'super_admin', t_a);
    RAISE EXCEPTION 'An owner can make itself a super admin in its tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (target_a, 'super_admin', t_a);
    RAISE EXCEPTION 'An owner can make a member a super admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.user_roles SET role = 'super_admin' WHERE id = own_role_a;
    RAISE EXCEPTION 'An owner can turn its own role into super_admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.user_roles SET role = 'super_admin', tenant_id = NULL WHERE id = own_role_a;
    RAISE EXCEPTION 'An owner can turn its own role into a global super_admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.user_roles SET tenant_id = t_b WHERE id = own_role_a;
    RAISE EXCEPTION 'An owner can move a role to another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.user_roles SET tenant_id = NULL WHERE id = own_role_a;
    RAISE EXCEPTION 'An owner can make a role global';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (owner_a, 'owner', t_b);
    RAISE EXCEPTION 'An owner can make itself owner of another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (target_b, 'team_manager', t_b);
    RAISE EXCEPTION 'An owner can grant a role in another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.user_roles SET role = 'seo' WHERE id IN (own_role_b, target_b_role);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'An owner can change roles in another tenant'; END IF;
  DELETE FROM public.user_roles WHERE id IN (own_role_b, target_b_role);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'An owner can remove roles in another tenant'; END IF;

  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (target_a, 'campaigner', t_a);
  UPDATE public.user_roles SET role = 'sales_person' WHERE id = own_role_a;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'An owner cannot change a role in its own tenant'; END IF;
  DELETE FROM public.user_roles WHERE id = own_role_a;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'An owner cannot remove a role in its own tenant'; END IF;

  BEGIN
    INSERT INTO public.user_permissions (user_id, module, can_access) VALUES (target_b, 'clients', true);
    RAISE EXCEPTION 'An owner can grant permissions to another tenant''s member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_permissions (user_id, module, can_access) VALUES (outsider, 'finance', true);
    RAISE EXCEPTION 'An owner can grant permissions to a user in no tenant of theirs';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.user_permissions SET can_access = true WHERE user_id = target_b;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'An owner can change another tenant member''s permissions'; END IF;
  DELETE FROM public.user_permissions WHERE user_id = target_b;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'An owner can remove another tenant member''s permissions'; END IF;
  INSERT INTO public.user_permissions (user_id, module, can_access) VALUES (target_a, 'finance', true);
  UPDATE public.user_permissions SET can_access = false WHERE user_id = target_a AND module = 'finance';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'An owner cannot change its member''s permissions'; END IF;
  DELETE FROM public.user_permissions WHERE user_id = target_a;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'An owner cannot remove its member''s permissions'; END IF;
  INSERT INTO public.user_permissions (user_id, module, can_access) VALUES (target_a, 'clients', true);

  BEGIN
    INSERT INTO public.invitation_tokens (token, tenant_id, created_by, email, metadata)
    VALUES (gen_random_uuid()::text, t_b, owner_a, 'qa-x@example.invalid', '{"role": "owner"}');
    RAISE EXCEPTION 'An owner can invite into another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.invitation_tokens (token, tenant_id, created_by, email, metadata)
    VALUES (gen_random_uuid()::text, t_a, owner_a, 'qa-x@example.invalid', '{"role": "super_admin"}');
    RAISE EXCEPTION 'An owner can invite a super admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.invitation_tokens (token, tenant_id, created_by, email, metadata)
  VALUES (gen_random_uuid()::text, t_a, owner_a, 'qa-y@example.invalid', '{"role": "owner"}');

  -- A member of A grants itself nothing and rewrites no invitation.
  PERFORM set_config('request.jwt.claim.sub', member_a::text, true);
  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (member_a, 'owner', t_a);
    RAISE EXCEPTION 'A member can make itself owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_permissions (user_id, module, can_access) VALUES (member_a, 'finance', true);
    RAISE EXCEPTION 'A member can grant itself permissions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.invitation_tokens SET metadata = '{"role": "owner"}', email = 'qa-z@example.invalid'
  WHERE id = token_a;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'A member can rewrite an invitation'; END IF;
  BEGIN
    PERFORM public.merge_orphan_profile_by_email(member_a, 'qa-invite@example.invalid');
    RAISE EXCEPTION 'A signed-in user can call merge_orphan_profile_by_email';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.assign_role_by_email('qa-roles-' || member_a || '@example.invalid', 'owner');
    RAISE EXCEPTION 'A signed-in user can call assign_role_by_email';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A super admin grants super_admin, but only as a global role.
  PERFORM set_config('request.jwt.claim.sub', admin::text, true);
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (target_a, 'super_admin', NULL);
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (target_b, 'owner', t_b);
  INSERT INTO public.user_permissions (user_id, module, can_access) VALUES (outsider, 'clients', true);
  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (target_b, 'super_admin', t_b);
    RAISE EXCEPTION 'A tenant-scoped super_admin row can be written';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Anonymous.
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (outsider, 'owner', t_a);
    RAISE EXCEPTION 'Anonymous can grant a role';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.invitation_tokens SET metadata = '{"role": "owner"}';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Anonymous can rewrite invitations'; END IF;
  BEGIN
    PERFORM public.merge_orphan_profile_by_email(outsider, 'qa-invite@example.invalid');
    RAISE EXCEPTION 'Anonymous can call merge_orphan_profile_by_email';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.assign_role_by_email('qa-roles-' || outsider || '@example.invalid', 'super_admin');
    RAISE EXCEPTION 'Anonymous can call assign_role_by_email';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The server still grants super_admin, also only as a global role.
  RESET ROLE;
  SET LOCAL ROLE service_role;
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (outsider, 'super_admin', NULL);
  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (outsider, 'super_admin', t_a);
    RAISE EXCEPTION 'The server can write a tenant-scoped super_admin row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- Defense in depth: with a policy that lets anyone insert, an owner still
  -- cannot write super_admin.
  CREATE POLICY qa_rollback_allow_all ON public.user_roles FOR INSERT TO authenticated WITH CHECK (true);
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (owner_a, 'super_admin', NULL);
    RAISE EXCEPTION 'Only the policies stop an owner from writing super_admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = target_a AND role = 'campaigner' AND tenant_id = t_a)
    OR NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = target_a AND module = 'clients')
    OR NOT EXISTS (SELECT 1 FROM public.invitation_tokens WHERE tenant_id = t_a AND email = 'qa-y@example.invalid')
    OR NOT public.is_super_admin(target_a) OR NOT public.is_super_admin(outsider)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = owner_a AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = owner_a AND tenant_id = t_b AND role <> 'campaigner')
    OR (SELECT metadata ->> 'role' FROM public.invitation_tokens WHERE id = token_a) <> 'campaigner'
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = member_a) THEN
    RAISE EXCEPTION 'The allowed writes did not land, or a refused one did';
  END IF;
END;
$test$;
SELECT 'Role, permission and invitation grants are tenant-scoped; super_admin is global and server or super admin only' AS result;
ROLLBACK;
