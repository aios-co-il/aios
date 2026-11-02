-- Active tenant membership (20261102090000_active_tenant_membership): who may
-- set or read user_active_tenant, and that a refused switch opens no data of
-- the other tenant. Synthetic users and tenants inside one transaction that is
-- rolled back.
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

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_member uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_super uuid := gen_random_uuid();
  v_own uuid;
  v_second uuid;
  v_foreign uuid;
  v_rows integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-active-tenant-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_member, v_other, v_super]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-at-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK second', 'qa-at-second-' || v_tag) RETURNING id INTO v_second;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK foreign', 'qa-at-foreign-' || v_tag) RETURNING id INTO v_foreign;

  -- The member belongs to two tenants and holds only a user_roles row in the
  -- foreign one; the other user belongs to the foreign tenant; the super
  -- admin belongs to none.
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_member, 'member'),
    (v_second, v_member, 'member'),
    (v_foreign, v_other, 'owner');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (v_member, 'owner', v_foreign),
    (v_super, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_other, v_foreign);
  INSERT INTO public.lead_statuses (tenant_id, status_key, label)
  VALUES (v_foreign, 'qa_rollback_' || v_tag, 'QA ROLLBACK foreign status');

  -- A member switches to each of their own tenants: insert, then update.
  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.qa_switch(v_member, v_own);
  IF public.get_effective_tenant_id() IS DISTINCT FROM v_own THEN
    RAISE EXCEPTION 'member: switching to their own tenant must take effect';
  END IF;
  PERFORM pg_temp.qa_switch(v_member, v_second);
  IF public.get_effective_tenant_id() IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'member: switching to their second tenant must take effect';
  END IF;

  -- A member cannot switch to a tenant they do not belong to, even with a
  -- user_roles row there, by upsert or by update.
  BEGIN
    PERFORM pg_temp.qa_switch(v_member, v_foreign);
    RAISE EXCEPTION 'member: upsert to a foreign tenant must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'new row violates row-level security policy%' THEN RAISE; END IF;
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

  -- A member cannot read or write another user's row.
  SELECT count(*) INTO v_rows FROM public.user_active_tenant WHERE user_id = v_other;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'member: must not read another user''s row'; END IF;
  BEGIN
    PERFORM pg_temp.qa_switch(v_other, v_own);
    RAISE EXCEPTION 'member: writing another user''s row must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.user_active_tenant SET tenant_id = v_own WHERE user_id = v_other;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'member: updated another user''s row'; END IF;
  DELETE FROM public.user_active_tenant WHERE user_id = v_other;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'member: deleted another user''s row'; END IF;
  RESET ROLE;

  -- A super admin switches to any tenant, and the helpers honour it.
  PERFORM pg_temp.qa_sign_in(v_super);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.qa_switch(v_super, v_foreign);
  IF public.get_effective_tenant_id() IS DISTINCT FROM v_foreign THEN
    RAISE EXCEPTION 'super admin: switching to any tenant must take effect';
  END IF;
  SELECT count(*) INTO v_rows FROM public.user_active_tenant WHERE user_id IN (v_super, v_other);
  IF v_rows <> 2 THEN RAISE EXCEPTION 'super admin: must read every row, read %', v_rows; END IF;

  -- A super admin still writes only their own row.
  BEGIN
    PERFORM pg_temp.qa_switch(v_member, v_own);
    RAISE EXCEPTION 'super admin: writing another user''s row must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.user_active_tenant SET tenant_id = v_own WHERE user_id = v_other;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'super admin: updated another user''s row'; END IF;
  RESET ROLE;

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
SELECT 'Active tenant membership: member, foreign tenant, super admin, other users'' rows and anon passed' AS result;
ROLLBACK;
