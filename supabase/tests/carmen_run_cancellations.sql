-- Run cancellations (20261110200000_carmen_run_cancellations): a member stops
-- their own runs in their org, cannot stop as someone else or in another org,
-- and reads only their own stops. Synthetic users and tenants, rolled back.
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
  v_member uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_own uuid;
  v_foreign uuid;
  v_rows integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-run-cancel-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_member, v_other]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-rc-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-rc-other-' || v_tag) RETURNING id INTO v_foreign;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_member, 'member'),
    (v_own, v_other, 'member');
  INSERT INTO public.carmen_run_cancellations (run_id, tenant_id, user_id)
  VALUES (gen_random_uuid(), v_own, v_other);

  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  -- A member stops their own run.
  INSERT INTO public.carmen_run_cancellations (run_id, tenant_id)
  VALUES (gen_random_uuid(), v_own);
  -- Not as someone else.
  BEGIN
    INSERT INTO public.carmen_run_cancellations (run_id, tenant_id, user_id)
    VALUES (gen_random_uuid(), v_own, v_other);
    RAISE EXCEPTION 'stopping as another user must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Not in an org they do not belong to.
  BEGIN
    INSERT INTO public.carmen_run_cancellations (run_id, tenant_id)
    VALUES (gen_random_uuid(), v_foreign);
    RAISE EXCEPTION 'stopping in another org must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Reads only their own.
  SELECT count(*) INTO v_rows FROM public.carmen_run_cancellations;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'member must read only their own stop, saw %', v_rows;
  END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.carmen_run_cancellations;
    RAISE EXCEPTION 'anon: reading stops must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END
$test$;
SELECT 'Run cancellations: own stops only, own org only, anon refused' AS result;
ROLLBACK;
