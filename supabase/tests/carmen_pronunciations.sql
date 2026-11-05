-- Carmen's pronunciation dictionary (20261105210000_carmen_pronunciations):
-- members of an org add and correct its terms, a correction replaces the
-- entry whatever its case, and nobody reads or writes another org's terms.
-- Synthetic users and tenants inside one transaction that is rolled back.
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
  v_outsider uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_rows integer;
  v_spoken text;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-pronunciation-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_member, v_outsider]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-pr-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-pr-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_member, 'member'),
    (v_other, v_outsider, 'owner');
  INSERT INTO public.carmen_pronunciations (tenant_id, term, spoken)
  VALUES (v_other, 'AIOS', 'איי-איי-או-אס');

  -- A member adds a term, then corrects it with different casing: one row, the new pronunciation.
  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.carmen_pronunciations (tenant_id, term, spoken)
  VALUES (v_own, 'AIOS', 'אַיוֹס');
  INSERT INTO public.carmen_pronunciations (tenant_id, term, spoken)
  VALUES (v_own, ' aios ', 'אֵיי-אַיי-או-אֶס')
  ON CONFLICT (tenant_id, term_key) DO UPDATE SET spoken = EXCLUDED.spoken;
  SELECT count(*), max(spoken) INTO v_rows, v_spoken FROM public.carmen_pronunciations;
  IF v_rows <> 1 OR v_spoken <> 'אֵיי-אַיי-או-אֶס' THEN
    RAISE EXCEPTION 'member: a correction must replace the term (rows %, spoken %)', v_rows, v_spoken;
  END IF;

  -- The member neither sees nor writes another org's terms.
  SELECT count(*) INTO v_rows FROM public.carmen_pronunciations WHERE tenant_id = v_other;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member: another org''s terms must be hidden';
  END IF;
  BEGIN
    INSERT INTO public.carmen_pronunciations (tenant_id, term, spoken)
    VALUES (v_other, 'כרמן', 'קַרְמֶן');
    RAISE EXCEPTION 'member: writing another org''s term must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- anon gets nothing.
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.carmen_pronunciations;
    RAISE EXCEPTION 'anon: reading terms must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END
$test$;
SELECT 'Carmen pronunciations: members add and correct, other org hidden, anon refused' AS result;
ROLLBACK;
