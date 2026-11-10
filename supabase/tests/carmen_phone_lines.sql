-- Carmen's phone line (20261109070000_carmen_phone_lines,
-- 20261109090000_carmen_phone_lines_super_admin): only a super admin adds or
-- changes a number, owners read and remove their org's numbers, members read
-- them, a number belongs to one org only, and no signed-in user writes call
-- rows. Synthetic users and tenants inside one transaction that is rolled back.
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
  v_admin uuid := gen_random_uuid();
  v_own uuid;
  v_line uuid;
  v_other uuid;
  v_rows integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-phone-line-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_owner, v_member, v_outsider, v_admin]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-pl-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-pl-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_owner, 'owner'),
    (v_own, v_member, 'member'),
    (v_other, v_outsider, 'owner');
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (v_admin, NULL, 'super_admin');
  INSERT INTO public.carmen_phone_lines (tenant_id, phone_number)
  VALUES (v_other, '+972-3-555-0101');

  -- An owner cannot register a number, even for their own org: one phone agent
  -- serves every org, so a number claimed first would take its calls.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.carmen_phone_lines (tenant_id, phone_number)
    VALUES (v_own, '03-5550202');
    RAISE EXCEPTION 'owner: adding a number must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A super admin registers the org's number.
  PERFORM pg_temp.qa_sign_in(v_admin);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.carmen_phone_lines (tenant_id, phone_number)
  VALUES (v_own, '03-5550202') RETURNING id INTO v_line;
  RESET ROLE;

  -- An owner cannot change their org's number.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  UPDATE public.carmen_phone_lines SET phone_number = '03-5550909'
  WHERE id = v_line;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'owner: changing a number must be refused, changed %', v_rows;
  END IF;
  RESET ROLE;

  -- The same number, typed differently, cannot belong to a second org.
  BEGIN
    INSERT INTO public.carmen_phone_lines (tenant_id, phone_number)
    VALUES (v_own, '035550101');
    RAISE EXCEPTION 'a number owned by another org must be refused';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- A member reads the number but cannot add one, and cannot write a call.
  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_phone_lines;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'member: must read exactly their org''s number, saw %', v_rows;
  END IF;
  BEGIN
    INSERT INTO public.carmen_phone_lines (tenant_id, phone_number)
    VALUES (v_own, '03-5550303');
    RAISE EXCEPTION 'member: adding a number must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.carmen_phone_calls (tenant_id, caller_kind)
    VALUES (v_own, 'staff');
    RAISE EXCEPTION 'member: writing a call row must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- The owner of one org neither sees nor writes another org's numbers.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_phone_lines
  WHERE tenant_id = v_other;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'owner: another org''s number must be hidden';
  END IF;
  BEGIN
    INSERT INTO public.carmen_phone_lines (tenant_id, phone_number)
    VALUES (v_other, '03-5550404');
    RAISE EXCEPTION 'owner: adding a number to another org must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- The owner reads and removes their org's number.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_phone_lines
  WHERE id = v_line AND phone_number = '03-5550202';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner: must read their org''s unchanged number, saw %', v_rows;
  END IF;
  DELETE FROM public.carmen_phone_lines WHERE id = v_line;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner: removing their org''s number must succeed';
  END IF;
  RESET ROLE;

  -- anon gets nothing.
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.carmen_phone_calls;
    RAISE EXCEPTION 'anon: reading calls must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END
$test$;
SELECT 'Carmen phone lines: super admin registers, owner reads and removes, member reads, one org per number, calls service-only' AS result;
ROLLBACK;
