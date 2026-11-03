-- Carmen automation switches (20261103100000_carmen_automation_settings):
-- members read their org's switches, only owners write them, and nobody reads
-- or writes another org's. Synthetic users and tenants inside one transaction
-- that is rolled back.
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
  v_owner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_rows integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-automation-switch-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_owner, v_member, v_outsider]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-as-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-as-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_owner, 'owner'),
    (v_own, v_member, 'member'),
    (v_other, v_outsider, 'owner');
  INSERT INTO public.carmen_automation_settings (tenant_id, automation_key, enabled)
  VALUES (v_other, 'meta_status_check', false);

  -- The owner switches the Meta check off for their org.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.carmen_automation_settings (tenant_id, automation_key, enabled)
  VALUES (v_own, 'meta_status_check', false);
  UPDATE public.carmen_automation_settings SET enabled = true
  WHERE tenant_id = v_own AND automation_key = 'meta_status_check';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner: updating their org''s switch must change one row';
  END IF;

  -- A member reads the switch but cannot change or add one.
  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_automation_settings;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'member: must read exactly their org''s switch, saw %', v_rows;
  END IF;
  UPDATE public.carmen_automation_settings SET enabled = false
  WHERE tenant_id = v_own;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member: changing a switch must be refused';
  END IF;
  BEGIN
    INSERT INTO public.carmen_automation_settings (tenant_id, automation_key, enabled)
    VALUES (v_own, 'reconcile_nightly', false);
    RAISE EXCEPTION 'member: adding a switch must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- The owner of one org neither sees nor writes another org's switches.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_automation_settings
  WHERE tenant_id = v_other;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'owner: another org''s switch must be hidden';
  END IF;
  BEGIN
    INSERT INTO public.carmen_automation_settings (tenant_id, automation_key, enabled)
    VALUES (v_other, 'reconcile_nightly', false);
    RAISE EXCEPTION 'owner: writing another org''s switch must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- anon gets nothing.
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.carmen_automation_settings;
    RAISE EXCEPTION 'anon: reading switches must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END
$test$;
SELECT 'Carmen automation switches: owner writes, member reads, other org hidden, anon refused' AS result;
ROLLBACK;
