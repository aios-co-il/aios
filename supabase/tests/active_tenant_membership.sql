-- Active tenant membership (20261102109000_active_tenant_membership): who may
-- set or read user_active_tenant, that a refused switch opens no data of the
-- other tenant, that the service role meets the same rule, and that losing the
-- super_admin role clears a tenant the user does not belong to. Synthetic
-- users and tenants inside one transaction that is rolled back.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

-- The app's switch (supabase-js upsert on user_id).
CREATE FUNCTION pg_temp.qa_switch(p_user uuid, p_tenant uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  INSERT INTO public.user_active_tenant (user_id, tenant_id, updated_at)
  VALUES (p_user, p_tenant, now())
  ON CONFLICT (user_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, tenant_id = EXCLUDED.tenant_id, updated_at = EXCLUDED.updated_at;
$fn$;

-- The user's active tenant, read past RLS (call after RESET ROLE).
CREATE FUNCTION pg_temp.qa_active(p_user uuid)
RETURNS uuid
LANGUAGE sql
AS $fn$
  SELECT tenant_id FROM public.user_active_tenant WHERE user_id = p_user;
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_member uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_peer uuid := gen_random_uuid();
  v_super uuid := gen_random_uuid();
  v_super_member uuid := gen_random_uuid();
  v_super_moved uuid := gen_random_uuid();
  v_own uuid;
  v_second uuid;
  v_foreign uuid;
  v_rows integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-active-tenant-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_member, v_other, v_peer, v_super, v_super_member, v_super_moved]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-at-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK second', 'qa-at-second-' || v_tag) RETURNING id INTO v_second;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK foreign', 'qa-at-foreign-' || v_tag) RETURNING id INTO v_foreign;

  -- The member belongs to own and second and holds only a user_roles row in
  -- foreign; the other user belongs to foreign; the peer belongs to own and
  -- has no active tenant; the super admins belong to none, except one in own.
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_member, 'member'),
    (v_second, v_member, 'member'),
    (v_foreign, v_other, 'owner'),
    (v_own, v_peer, 'member'),
    (v_own, v_super_member, 'member');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (v_member, 'owner', v_foreign),
    (v_super, 'super_admin', NULL),
    (v_super_member, 'super_admin', NULL),
    (v_super_moved, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (v_other, v_foreign),
    (v_super_member, v_own),
    (v_super_moved, v_second);
  INSERT INTO public.lead_statuses (tenant_id, status_key, label)
  VALUES (v_foreign, 'qa_rollback_' || v_tag, 'QA ROLLBACK foreign status');

  -- A member sets their own tenant (plain insert), then switches to their
  -- second one (upsert on the existing row).
  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_member, v_own);
  RESET ROLE;
  IF pg_temp.qa_active(v_member) IS DISTINCT FROM v_own THEN
    RAISE EXCEPTION 'member: inserting their own tenant must be stored';
  END IF;

  -- Moving the row to a peer of that tenant passes the trigger; only the
  -- update policy refuses it.
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.user_active_tenant SET user_id = v_peer WHERE user_id = v_member;
    RAISE EXCEPTION 'member: moving their row to another user must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.qa_switch(v_member, v_second);
  IF public.get_effective_tenant_id() IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'member: switching to their second tenant must take effect';
  END IF;

  -- A member cannot switch to a tenant they do not belong to, even with a
  -- user_roles row there, by upsert, update or insert.
  BEGIN
    PERFORM pg_temp.qa_switch(v_member, v_foreign);
    RAISE EXCEPTION 'member: upsert to a foreign tenant must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.user_active_tenant SET tenant_id = v_foreign WHERE user_id = v_member;
    RAISE EXCEPTION 'member: update to a foreign tenant must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  DELETE FROM public.user_active_tenant WHERE user_id = v_member;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'member: must delete their own row, deleted %', v_rows; END IF;
  BEGIN
    INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_member, v_foreign);
    RAISE EXCEPTION 'member: insert of a foreign tenant must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_rows FROM public.lead_statuses WHERE tenant_id = v_foreign;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'member: must read no foreign tenant data, read %', v_rows; END IF;

  -- A member cannot read or write another user's row, even for a tenant that
  -- user belongs to.
  SELECT count(*) INTO v_rows FROM public.user_active_tenant WHERE user_id = v_other;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'member: must not read another user''s row'; END IF;
  BEGIN
    INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_peer, v_own);
    RAISE EXCEPTION 'member: inserting another user''s row must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.user_active_tenant SET updated_at = now() WHERE user_id = v_other;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'member: updated another user''s row'; END IF;
  DELETE FROM public.user_active_tenant WHERE user_id = v_other;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'member: deleted another user''s row'; END IF;
  RESET ROLE;
  SELECT count(*) INTO v_rows FROM public.user_active_tenant WHERE user_id IN (v_member, v_peer);
  IF v_rows <> 0 THEN RAISE EXCEPTION 'member: refused writes left % row(s)', v_rows; END IF;

  -- A super admin switches to any tenant and reads every row. Moving their
  -- row to a peer of that tenant passes the trigger and the read policy; only
  -- the update policy refuses it.
  PERFORM pg_temp.qa_sign_in(v_super);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.qa_switch(v_super, v_own);
  BEGIN
    UPDATE public.user_active_tenant SET user_id = v_peer WHERE user_id = v_super;
    RAISE EXCEPTION 'super admin: moving their row to a member of its tenant must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.qa_switch(v_super, v_foreign);
  IF public.get_effective_tenant_id() IS DISTINCT FROM v_foreign THEN
    RAISE EXCEPTION 'super admin: switching to any tenant must take effect';
  END IF;
  SELECT count(*) INTO v_rows FROM public.user_active_tenant WHERE user_id IN (v_super, v_other);
  IF v_rows <> 2 THEN RAISE EXCEPTION 'super admin: must read every row, read %', v_rows; END IF;

  -- A super admin still writes only their own row: insert, update, move and
  -- delete of another user's row are refused.
  BEGIN
    INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_peer, v_own);
    RAISE EXCEPTION 'super admin: inserting another user''s row must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.user_active_tenant SET updated_at = now() WHERE user_id = v_other;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'super admin: updated another user''s row'; END IF;
  BEGIN
    UPDATE public.user_active_tenant SET user_id = v_peer WHERE user_id = v_super;
    RAISE EXCEPTION 'super admin: moving their row to another user must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  DELETE FROM public.user_active_tenant WHERE user_id = v_other;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'super admin: deleted another user''s row'; END IF;
  RESET ROLE;
  IF pg_temp.qa_active(v_other) IS DISTINCT FROM v_foreign OR pg_temp.qa_active(v_peer) IS NOT NULL THEN
    RAISE EXCEPTION 'super admin: another user''s row changed';
  END IF;

  -- The service role (RLS-exempt) meets the same rule through the trigger.
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_peer, v_foreign);
    RAISE EXCEPTION 'service role: inserting a foreign tenant must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_peer, v_own);
  BEGIN
    UPDATE public.user_active_tenant SET tenant_id = v_foreign WHERE user_id = v_peer;
    RAISE EXCEPTION 'service role: updating to a foreign tenant must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  IF pg_temp.qa_active(v_peer) IS DISTINCT FROM v_own THEN
    RAISE EXCEPTION 'service role: a member tenant must be stored, and only that';
  END IF;

  -- Losing super_admin clears an active tenant the user does not belong to
  -- (role deleted, or changed into a tenant role), and keeps one they do.
  DELETE FROM public.user_roles WHERE user_id = v_super AND role = 'super_admin';
  IF pg_temp.qa_active(v_super) IS NOT NULL THEN
    RAISE EXCEPTION 'super admin removed: a non-member active tenant must be cleared';
  END IF;
  IF public.get_user_tenant_id(v_super) IS NOT NULL THEN
    RAISE EXCEPTION 'super admin removed: no tenant must remain';
  END IF;

  UPDATE public.user_roles SET role = 'owner', tenant_id = v_second
  WHERE user_id = v_super_moved AND role = 'super_admin';
  IF pg_temp.qa_active(v_super_moved) IS NOT NULL THEN
    RAISE EXCEPTION 'super admin changed to a tenant role: a non-member active tenant must be cleared';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_super_member AND role = 'super_admin';
  IF pg_temp.qa_active(v_super_member) IS DISTINCT FROM v_own THEN
    RAISE EXCEPTION 'super admin removed: an active tenant they belong to must stay';
  END IF;

  -- Signed out, nothing is readable or writable.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_rows FROM public.user_active_tenant;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'anon: must read no row, read %', v_rows; END IF;
  BEGIN
    INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_member, v_own);
    RAISE EXCEPTION 'anon: insert must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END
$test$;
SELECT 'Active tenant membership: member, foreign tenant, super admin, other users'' rows, service role, super admin removal and anon passed' AS result;
ROLLBACK;
