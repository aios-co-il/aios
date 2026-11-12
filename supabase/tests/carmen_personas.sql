-- Carmen personas (20261112100000_carmen_personas, 20261112110000_carmen_personas_personal):
-- members see the org's characters and their own, never a colleague's own or
-- another org's; a member's edit of a built-in is their own version; only an
-- owner (or super admin) writes the org's characters; each user writes only
-- their own choice. Synthetic users and tenants inside one transaction that is rolled back.
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
  v_me uuid := gen_random_uuid();
  v_colleague uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_rows integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-persona-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_me, v_colleague, v_owner, v_outsider]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-ps-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-ps-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_me, 'member'),
    (v_own, v_colleague, 'member'),
    (v_own, v_owner, 'owner'),
    (v_other, v_outsider, 'owner');
  INSERT INTO public.carmen_personas (tenant_id, owner_user_id, display_name, look) VALUES
    (v_own, v_colleague, 'Colleague own', 'orbs'),
    (v_other, NULL, 'Other org shared', 'orbs');

  -- The owner edits a built-in for the org.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.carmen_personas (tenant_id, builtin_key, display_name, look)
  VALUES (v_own, 'minime', 'מיני מי של הארגון', 'minime');
  RESET ROLE;

  PERFORM pg_temp.qa_sign_in(v_me);
  SET LOCAL ROLE authenticated;

  -- My edit of a built-in is my own version; a second one is refused.
  INSERT INTO public.carmen_personas (tenant_id, owner_user_id, builtin_key, display_name, look, call_words)
  VALUES (v_own, v_me, 'minime', 'המיני שלי', 'minime', ARRAY['מיני']);
  BEGIN
    INSERT INTO public.carmen_personas (tenant_id, owner_user_id, builtin_key, display_name, look)
    VALUES (v_own, v_me, 'minime', 'again', 'minime');
    RAISE EXCEPTION 'member: a second own version of a built-in must be refused';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- I cannot write for the org: no org-level edit of a built-in, no shared character.
  BEGIN
    INSERT INTO public.carmen_personas (tenant_id, builtin_key, display_name, look)
    VALUES (v_own, 'aios', 'AIOS', 'orbs');
    RAISE EXCEPTION 'member: an org-level edit of a built-in must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.carmen_personas (tenant_id, display_name, look)
    VALUES (v_own, 'Shared', 'orbs');
    RAISE EXCEPTION 'member: creating a character for the org must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.carmen_personas SET display_name = 'Taken' WHERE owner_user_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member: the org''s characters must not be editable';
  END IF;
  DELETE FROM public.carmen_personas WHERE owner_user_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member: the org''s characters must not be deletable';
  END IF;

  -- I see the org's edit and my own, not my colleague's own or the other org's.
  SELECT count(*) INTO v_rows FROM public.carmen_personas;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'member: must see the org''s and own characters only (saw %)', v_rows;
  END IF;

  -- Creating a character for another user, or in another org, is refused.
  BEGIN
    INSERT INTO public.carmen_personas (tenant_id, owner_user_id, display_name, look)
    VALUES (v_own, v_colleague, 'Planted', 'orbs');
    RAISE EXCEPTION 'member: creating a character for another user must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.carmen_personas (tenant_id, owner_user_id, display_name, look)
    VALUES (v_other, v_me, 'Planted', 'orbs');
    RAISE EXCEPTION 'member: creating a character in another org must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- My colleague's own character cannot be changed by me.
  UPDATE public.carmen_personas SET display_name = 'Taken' WHERE owner_user_id = v_colleague;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member: a colleague''s own character must not be editable';
  END IF;

  -- My colleague's own character cannot be deleted by me.
  DELETE FROM public.carmen_personas WHERE owner_user_id = v_colleague;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member: a colleague''s own character must not be deletable';
  END IF;

  -- I record my choice; I cannot record one for my colleague.
  INSERT INTO public.carmen_persona_choices (tenant_id, persona_key) VALUES (v_own, 'minime');
  BEGIN
    INSERT INTO public.carmen_persona_choices (tenant_id, user_id, persona_key)
    VALUES (v_own, v_colleague, 'carmen');
    RAISE EXCEPTION 'member: recording a choice for another user must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- My colleague does not see my choice.
  PERFORM pg_temp.qa_sign_in(v_colleague);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_persona_choices;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'colleague: another user''s choice must be hidden';
  END IF;
  RESET ROLE;

  -- The owner removes the org's edit.
  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.carmen_personas WHERE tenant_id = v_own AND owner_user_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner: must delete the org''s character (deleted %)', v_rows;
  END IF;
  RESET ROLE;

  -- anon gets nothing.
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.carmen_personas;
    RAISE EXCEPTION 'anon: reading characters must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END
$test$;
SELECT 'Carmen personas: own versions, org rows owner-only, others hidden, own choice only, anon refused' AS result;
ROLLBACK;
