-- Carmen device trusted sites (20261126180000_carmen_device_trusted_sites): each
-- user reads and deletes only their own trusted sites, in an org they belong
-- to; a colleague, a member who left and another org see and delete nothing;
-- no signed-in user inserts or updates a row, so nothing but the service role
-- records a trust; one row per user, org, conversation and exact origin; only
-- a bare https origin is stored; a row goes with its conversation. Synthetic
-- users and tenants inside one transaction that is rolled back.
--
-- A write that must be refused runs without a WHERE clause, so the refusal is
-- the missing privilege and not a row the SELECT policy hid.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

-- The number of trusted sites the user reads when signed in.
CREATE FUNCTION pg_temp.qa_visible_to(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_rows integer;
BEGIN
  PERFORM pg_temp.qa_sign_in(p_user);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_device_trusted_sites;
  RESET ROLE;
  RETURN v_rows;
END
$fn$;

-- The number of trusted sites the user's unfiltered DELETE removes when signed in.
CREATE FUNCTION pg_temp.qa_deleted_by(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_rows integer;
BEGIN
  PERFORM pg_temp.qa_sign_in(p_user);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.carmen_device_trusted_sites;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  RETURN v_rows;
END
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_me uuid := gen_random_uuid();
  v_colleague uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_conversation uuid;
  v_second uuid;
  v_outsider_conversation uuid;
  v_origin text;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-trusted-sites-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_me, v_colleague, v_outsider]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-ts-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-ts-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_me, 'member'),
    (v_own, v_colleague, 'member'),
    (v_other, v_outsider, 'owner');
  INSERT INTO public.ai_conversations (user_id, tenant_id)
  VALUES (v_me, v_own) RETURNING id INTO v_conversation;
  INSERT INTO public.ai_conversations (user_id, tenant_id)
  VALUES (v_me, v_own) RETURNING id INTO v_second;
  INSERT INTO public.ai_conversations (user_id, tenant_id)
  VALUES (v_outsider, v_other) RETURNING id INTO v_outsider_conversation;

  -- The edge function (service role) records my trust in two conversations and the outsider's in theirs.
  SET LOCAL ROLE service_role;
  INSERT INTO public.carmen_device_trusted_sites (tenant_id, user_id, conversation_id, origin) VALUES
    (v_own, v_me, v_conversation, 'https://shop.example'),
    (v_own, v_me, v_second, 'https://shop.example:8443'),
    (v_other, v_outsider, v_outsider_conversation, 'https://shop.example');
  RESET ROLE;

  -- The same trust twice is one row: the key holds tenant, user, conversation and origin.
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.carmen_device_trusted_sites (tenant_id, user_id, conversation_id, origin)
    VALUES (v_own, v_me, v_conversation, 'https://shop.example');
    RAISE EXCEPTION 'key: the same trust must not be stored twice';
  EXCEPTION WHEN unique_violation THEN RESET ROLE;
  END;

  -- Only a bare https origin is stored.
  FOREACH v_origin IN ARRAY ARRAY[
    'http://shop.example', 'https://shop.example/', 'https://shop.example/path',
    'https://user@shop.example', 'https://shop.example?x=1', 'javascript:alert(1)', 'https://'
  ] LOOP
    BEGIN
      INSERT INTO public.carmen_device_trusted_sites (tenant_id, user_id, conversation_id, origin)
      VALUES (v_own, v_me, v_conversation, v_origin);
      RAISE EXCEPTION 'origin: % must be refused', v_origin;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;

  -- I read my own two trusted sites and nothing of the outsider's.
  IF pg_temp.qa_visible_to(v_me) <> 2 THEN
    RAISE EXCEPTION 'member: must see only their own trusted sites';
  END IF;

  -- I record and change no trust myself, not even in my own conversation.
  PERFORM pg_temp.qa_sign_in(v_me);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.carmen_device_trusted_sites (tenant_id, user_id, conversation_id, origin)
    VALUES (v_own, v_me, v_conversation, 'https://bank.example');
    RAISE EXCEPTION 'member: inserting a trusted site must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_device_trusted_sites SET origin = 'https://bank.example';
    RAISE EXCEPTION 'member: updating a trusted site must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A colleague sees and deletes none of my trusted sites.
  IF pg_temp.qa_visible_to(v_colleague) <> 0 THEN
    RAISE EXCEPTION 'colleague: another user''s trusted sites must be hidden';
  END IF;
  IF pg_temp.qa_deleted_by(v_colleague) <> 0 THEN
    RAISE EXCEPTION 'colleague: must not revoke another user''s trust';
  END IF;

  -- A member who left the org no longer sees or revokes what they trusted there.
  DELETE FROM public.tenant_users WHERE tenant_id = v_own AND user_id = v_me;
  IF pg_temp.qa_visible_to(v_me) <> 0 OR pg_temp.qa_deleted_by(v_me) <> 0 THEN
    RAISE EXCEPTION 'leaver: trusted sites of a left org must be out of reach';
  END IF;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES (v_own, v_me, 'member');

  -- I revoke my own trusted sites, and only mine: the outsider keeps theirs.
  IF pg_temp.qa_deleted_by(v_me) <> 2 THEN
    RAISE EXCEPTION 'member: must revoke their own trusted sites';
  END IF;
  IF pg_temp.qa_visible_to(v_outsider) <> 1 THEN
    RAISE EXCEPTION 'other org: revoking my trust must keep theirs';
  END IF;

  -- The trust ends with the conversation.
  DELETE FROM public.ai_conversations WHERE id = v_outsider_conversation;
  IF EXISTS (SELECT 1 FROM public.carmen_device_trusted_sites WHERE conversation_id = v_outsider_conversation) THEN
    RAISE EXCEPTION 'cascade: a deleted conversation must take its trusted sites';
  END IF;

  -- anon holds nothing at all.
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.carmen_device_trusted_sites;
    RAISE EXCEPTION 'anon: reading trusted sites must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'carmen_device_trusted_sites: all checks passed';
END
$test$;

ROLLBACK;
