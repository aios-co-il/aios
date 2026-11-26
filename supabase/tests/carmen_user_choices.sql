-- Carmen user choices (20261125173000_carmen_user_choices): each user reads and
-- writes only their own brain and voice picks, in an org they belong to; one
-- pick never overwrites the other, and writing NULL clears it; no signed-in
-- user deletes a row; a member who left the org loses the row's reach; a super
-- admin writes their own picks only in the org they act in and reads nobody
-- else's; anon gets nothing. Synthetic users and tenants inside one transaction
-- that is rolled back.
--
-- A statement that must reach no row, or only the caller's own, runs without a
-- WHERE clause. With one, PostgreSQL also applies the SELECT policy to the
-- statement, and that policy would hide another user's row whatever the UPDATE
-- policy says.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_long_ago constant timestamptz := '2000-01-01 00:00:00+00';
  v_me uuid := gen_random_uuid();
  v_colleague uuid := gen_random_uuid();
  v_leaver uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_super uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_rows integer;
  v_names text[];
  v_row public.carmen_user_choices;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-user-choices-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_me, v_colleague, v_leaver, v_outsider, v_super]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-uc-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-uc-other-' || v_tag) RETURNING id INTO v_other;

  -- The super admin belongs to no org and acts in mine. The leaver already has
  -- picks, last changed long ago.
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_me, 'member'),
    (v_own, v_colleague, 'member'),
    (v_own, v_leaver, 'member'),
    (v_other, v_outsider, 'owner');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (v_super, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_super, v_own);
  INSERT INTO public.carmen_user_choices (tenant_id, user_id, brain_slug, updated_at)
  VALUES (v_own, v_leaver, 'smart', v_long_ago);

  PERFORM pg_temp.qa_sign_in(v_me);
  SET LOCAL ROLE authenticated;

  -- I pick a brain: the row is mine without naming myself, and holds no voice.
  INSERT INTO public.carmen_user_choices (tenant_id, brain_slug) VALUES (v_own, 'smart');
  SELECT count(*) INTO v_rows FROM public.carmen_user_choices;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'member: must see only their own picks (saw % rows)', v_rows;
  END IF;
  SELECT * INTO v_row FROM public.carmen_user_choices;
  IF v_row.user_id IS DISTINCT FROM v_me OR v_row.brain_slug IS DISTINCT FROM 'smart' OR v_row.voice IS NOT NULL THEN
    RAISE EXCEPTION 'member: the first pick must store my user, the brain and no voice (got %)', v_row;
  END IF;

  -- Picking a voice (the app's upsert, sending only that column) keeps the brain.
  INSERT INTO public.carmen_user_choices (tenant_id, voice) VALUES (v_own, 'shimmer')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id, voice = EXCLUDED.voice;
  SELECT * INTO v_row FROM public.carmen_user_choices;
  IF v_row.brain_slug IS DISTINCT FROM 'smart' OR v_row.voice IS DISTINCT FROM 'shimmer' THEN
    RAISE EXCEPTION 'member: picking a voice must keep the brain (got %)', v_row;
  END IF;

  -- Going back to the default brain keeps the voice.
  INSERT INTO public.carmen_user_choices (tenant_id, brain_slug) VALUES (v_own, NULL)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id, brain_slug = EXCLUDED.brain_slug;
  SELECT * INTO v_row FROM public.carmen_user_choices;
  IF v_row.brain_slug IS NOT NULL OR v_row.voice IS DISTINCT FROM 'shimmer' THEN
    RAISE EXCEPTION 'member: clearing the brain must keep the voice (got %)', v_row;
  END IF;

  -- A pick is 1 to 64 characters.
  BEGIN
    UPDATE public.carmen_user_choices SET brain_slug = '' WHERE tenant_id = v_own;
    RAISE EXCEPTION 'check: an empty brain_slug must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_user_choices SET voice = '' WHERE tenant_id = v_own;
    RAISE EXCEPTION 'check: an empty voice must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_user_choices SET brain_slug = repeat('b', 65) WHERE tenant_id = v_own;
    RAISE EXCEPTION 'check: a 65-character brain_slug must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_user_choices SET voice = repeat('v', 65) WHERE tenant_id = v_own;
    RAISE EXCEPTION 'check: a 65-character voice must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.carmen_user_choices
  SET brain_slug = repeat('b', 64), voice = repeat('v', 64) WHERE tenant_id = v_own;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'check: 64-character picks must be stored (updated % rows)', v_rows;
  END IF;

  -- Recording picks for another user, or in an org I do not belong to, is refused.
  BEGIN
    INSERT INTO public.carmen_user_choices (tenant_id, user_id, brain_slug)
    VALUES (v_own, v_colleague, 'smart');
    RAISE EXCEPTION 'member: recording picks for another user must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.carmen_user_choices (tenant_id, brain_slug) VALUES (v_other, 'smart');
    RAISE EXCEPTION 'member: recording picks in another org must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- My row cannot be handed to a colleague, who has none, or moved to another org.
  BEGIN
    UPDATE public.carmen_user_choices SET user_id = v_colleague;
    RAISE EXCEPTION 'member: handing my picks to another user must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_user_choices SET tenant_id = v_other;
    RAISE EXCEPTION 'member: moving my picks to another org must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- I cannot delete even my own row: a pick is cleared by writing NULL.
  BEGIN
    DELETE FROM public.carmen_user_choices;
    RAISE EXCEPTION 'member: deleting their own picks must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- My colleague in the same org does not see my picks and cannot change or delete them.
  PERFORM pg_temp.qa_sign_in(v_colleague);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_user_choices;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'colleague: another user''s picks must be hidden (saw % rows)', v_rows;
  END IF;
  UPDATE public.carmen_user_choices SET voice = 'taken';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'colleague: another user''s picks must not be editable (updated % rows)', v_rows;
  END IF;
  BEGIN
    DELETE FROM public.carmen_user_choices;
    RAISE EXCEPTION 'colleague: deleting another user''s picks must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A member changes their own picks and no other row, and updated_at moves.
  PERFORM pg_temp.qa_sign_in(v_leaver);
  SET LOCAL ROLE authenticated;
  UPDATE public.carmen_user_choices SET voice = 'alloy';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'member: must update exactly their own picks (updated % rows)', v_rows;
  END IF;
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM public.carmen_user_choices
    WHERE tenant_id = v_own AND user_id = v_leaver AND voice = 'alloy' AND updated_at > v_long_ago
  ) THEN
    RAISE EXCEPTION 'trigger: updated_at must move when a pick changes';
  END IF;

  -- After leaving the org, that member no longer reads, changes, deletes or re-records the row.
  DELETE FROM public.tenant_users WHERE tenant_id = v_own AND user_id = v_leaver;
  PERFORM pg_temp.qa_sign_in(v_leaver);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_user_choices;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'leaver: picks in an org they left must be hidden (saw % rows)', v_rows;
  END IF;
  UPDATE public.carmen_user_choices SET voice = 'echo';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'leaver: picks in an org they left must not be editable (updated % rows)', v_rows;
  END IF;
  BEGIN
    DELETE FROM public.carmen_user_choices;
    RAISE EXCEPTION 'leaver: deleting picks in an org they left must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.carmen_user_choices (tenant_id, voice) VALUES (v_own, 'echo')
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id, voice = EXCLUDED.voice;
    RAISE EXCEPTION 'leaver: recording picks in an org they left must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A super admin records their own picks in the org they act in without belonging to it.
  PERFORM pg_temp.qa_sign_in(v_super);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.carmen_user_choices (tenant_id, brain_slug) VALUES (v_own, 'smart');

  -- They still read, change and delete nobody else's picks, and record none for another user.
  SELECT count(*) INTO v_rows FROM public.carmen_user_choices;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'super admin: must see only their own picks (saw % rows)', v_rows;
  END IF;
  UPDATE public.carmen_user_choices SET voice = 'alloy';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'super admin: must update their own picks and nobody else''s (updated % rows)', v_rows;
  END IF;
  BEGIN
    DELETE FROM public.carmen_user_choices;
    RAISE EXCEPTION 'super admin: deleting picks must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.carmen_user_choices (tenant_id, user_id, brain_slug)
    VALUES (v_own, v_colleague, 'smart');
    RAISE EXCEPTION 'super admin: recording picks for another user must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- In an org they do not act in, a super admin records nothing and moves nothing there.
  BEGIN
    INSERT INTO public.carmen_user_choices (tenant_id, brain_slug) VALUES (v_other, 'smart');
    RAISE EXCEPTION 'super admin: recording picks outside the org they act in must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_user_choices SET tenant_id = v_other;
    RAISE EXCEPTION 'super admin: moving picks to an org they do not act in must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- After switching to the other org, their picks in the first stay readable but not writable.
  UPDATE public.user_active_tenant SET tenant_id = v_other WHERE user_id = v_super;
  PERFORM pg_temp.qa_sign_in(v_super);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_user_choices;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'super admin: must still read exactly their own picks in another org (saw % rows)', v_rows;
  END IF;
  UPDATE public.carmen_user_choices SET voice = 'echo';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'super admin: picks outside the org they act in must not be editable (updated % rows)', v_rows;
  END IF;
  RESET ROLE;

  -- The service role, which the server reads with, sees every user's picks; mine are as I left them.
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_rows FROM public.carmen_user_choices WHERE tenant_id = v_own;
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'service role: must read every user''s picks in the org (saw % rows)', v_rows;
  END IF;
  SELECT * INTO v_row FROM public.carmen_user_choices WHERE tenant_id = v_own AND user_id = v_me;
  IF v_row.brain_slug IS DISTINCT FROM repeat('b', 64) OR v_row.voice IS DISTINCT FROM repeat('v', 64) THEN
    RAISE EXCEPTION 'member: nobody else may change my picks (got %)', v_row;
  END IF;
  RESET ROLE;

  -- anon reads and writes nothing.
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.carmen_user_choices;
    RAISE EXCEPTION 'anon: reading picks must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.carmen_user_choices (tenant_id, user_id, brain_slug) VALUES (v_own, v_me, 'smart');
    RAISE EXCEPTION 'anon: recording picks must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- Signed-in users hold exactly read, insert and update: no DELETE, and no TRUNCATE, which
  -- row-level security does not cover. anon and PUBLIC (grantee 0) hold nothing.
  SELECT array_agg(g.held ORDER BY g.held) INTO v_names
  FROM (
    SELECT coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type AS held
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
    WHERE c.oid = 'public.carmen_user_choices'::regclass
      AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
  ) g;
  IF v_names IS DISTINCT FROM ARRAY['authenticated:INSERT', 'authenticated:SELECT', 'authenticated:UPDATE'] THEN
    RAISE EXCEPTION 'grants: unexpected grants to PUBLIC, anon or authenticated on public.carmen_user_choices: %', v_names;
  END IF;

  -- Policies are permissive and OR together: only these three, one command each, for authenticated only.
  SELECT array_agg(p.policyname || ':' || p.cmd ORDER BY p.policyname) INTO v_names
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'carmen_user_choices';
  IF v_names IS DISTINCT FROM ARRAY[
    'carmen_user_choices_insert:INSERT', 'carmen_user_choices_select:SELECT', 'carmen_user_choices_update:UPDATE'
  ] THEN
    RAISE EXCEPTION 'policies: unexpected policies on public.carmen_user_choices: %', v_names;
  END IF;
  SELECT count(*) INTO v_rows
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'carmen_user_choices'
    AND (p.roles <> ARRAY['authenticated']::name[] OR p.permissive <> 'PERMISSIVE');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'policies: % policy(ies) on public.carmen_user_choices are not permissive for authenticated only', v_rows;
  END IF;

  -- Realtime carries the table, so an open session follows a pick made elsewhere.
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'carmen_user_choices: publication supabase_realtime does not exist; membership not checked';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'carmen_user_choices'
  ) THEN
    RAISE EXCEPTION 'realtime: public.carmen_user_choices must be in publication supabase_realtime';
  END IF;
END
$test$;
SELECT 'Carmen user choices: own picks only, one pick keeps the other, no deletes, leavers and other orgs refused, super admin only in the acting org, anon refused' AS result;
ROLLBACK;
