-- Carmen caller policies (20261108060000_carmen_caller_policies):
-- members read their org's policies, only owners write them, and nobody reads
-- or writes another org's. Synthetic users and tenants inside one transaction
-- that is rolled back.
BEGIN;

-- Signs in as the user; the caller then policies to the authenticated role.
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
  SELECT u, 'qa-caller-policy-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_owner, v_member, v_outsider]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-cp-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-cp-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_owner, 'owner'),
    (v_own, v_member, 'member'),
    (v_other, v_outsider, 'owner');
  INSERT INTO public.carmen_caller_policies (tenant_id, caller_kind, may_book_meeting)
  VALUES (v_other, 'unknown', true);

  -- The owner policies meeting booking on for unknown callers for their org.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.carmen_caller_policies (tenant_id, caller_kind, may_book_meeting)
  VALUES (v_own, 'unknown', true);
  UPDATE public.carmen_caller_policies SET may_book_meeting = false
  WHERE tenant_id = v_own AND caller_kind = 'unknown';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner: updating their org''s policy must change one row';
  END IF;

  -- A member reads the policy but cannot change or add one.
  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_caller_policies;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'member: must read exactly their org''s policy, saw %', v_rows;
  END IF;
  UPDATE public.carmen_caller_policies SET may_book_meeting = true
  WHERE tenant_id = v_own;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member: changing a policy must be refused';
  END IF;
  BEGIN
    INSERT INTO public.carmen_caller_policies (tenant_id, caller_kind, may_book_meeting)
    VALUES (v_own, 'client', true);
    RAISE EXCEPTION 'member: adding a policy must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- The owner of one org neither sees nor writes another org's policies.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_caller_policies
  WHERE tenant_id = v_other;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'owner: another org''s policy must be hidden';
  END IF;
  BEGIN
    INSERT INTO public.carmen_caller_policies (tenant_id, caller_kind, may_book_meeting)
    VALUES (v_other, 'client', true);
    RAISE EXCEPTION 'owner: writing another org''s policy must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- anon gets nothing.
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.carmen_caller_policies;
    RAISE EXCEPTION 'anon: reading policies must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END
$test$;
SELECT 'Carmen caller policies: owner writes, member reads, other org hidden, anon refused' AS result;
ROLLBACK;
