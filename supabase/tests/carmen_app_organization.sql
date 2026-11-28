-- The Android app's own organization (20261127120000_carmen_app_organization):
-- a member whose website has another organization open saves a voice call and
-- reads the Carmen style in the organization the app picked; nobody saves or
-- reads in an organization they do not belong to, or changes another user's
-- conversation; anon cannot call either function. Synthetic users and tenants
-- inside one transaction that is rolled back.
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
  v_peer uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_site uuid;
  v_app uuid;
  v_id uuid;
  v_peer_conversation uuid;
  v_messages jsonb := '[{"role":"user","content":"שלום"},{"role":"assistant","content":"היי"}]';
  v_style jsonb;
  v_rows integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-app-org-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_member, v_peer, v_outsider]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK site org', 'qa-ao-site-' || v_tag) RETURNING id INTO v_site;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK app org', 'qa-ao-app-' || v_tag) RETURNING id INTO v_app;

  -- The member belongs to both and has the site's organization open; the peer
  -- belongs to the app's organization; the outsider to the site's only.
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_site, v_member, 'member'),
    (v_app, v_member, 'member'),
    (v_app, v_peer, 'member'),
    (v_site, v_outsider, 'member');
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (v_member, v_site),
    (v_peer, v_app),
    (v_outsider, v_site);
  INSERT INTO public.tenant_settings (tenant_id, setting_key, setting_value)
  VALUES
    (v_app, 'carmen_avatar_style', '{"style":"minime"}'),
    (v_app, 'qa_other_setting', '{"secret":"not for members"}');
  INSERT INTO public.ai_conversations (user_id, tenant_id, title, messages)
  VALUES (v_peer, v_app, 'QA peer', '[]') RETURNING id INTO v_peer_conversation;

  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;

  -- The old path: a direct insert in the app's organization is refused while
  -- the website has another one open (the 403 the app got).
  BEGIN
    INSERT INTO public.ai_conversations (user_id, tenant_id, title, messages)
    VALUES (v_member, v_app, 'QA direct', v_messages);
    RAISE EXCEPTION 'precondition: the direct insert outside the active tenant should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The app's organization works through the function: insert, then update.
  v_id := public.carmen_save_voice_conversation(v_app, v_messages, 'QA voice');
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'member: saving a voice call in the app organization must return its id';
  END IF;

  IF public.carmen_save_voice_conversation(v_app, v_messages || '[{"role":"user","content":"עוד"}]', NULL, v_id)
     IS DISTINCT FROM v_id THEN
    RAISE EXCEPTION 'member: updating their own conversation must return its id';
  END IF;

  -- Not as another organization's conversation, nor another user's.
  BEGIN
    PERFORM public.carmen_save_voice_conversation(v_site, v_messages, NULL, v_id);
    RAISE EXCEPTION 'member: updating under another tenant must be refused';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  BEGIN
    PERFORM public.carmen_save_voice_conversation(v_app, v_messages, NULL, v_peer_conversation);
    RAISE EXCEPTION 'member: updating a colleague''s conversation must be refused';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  BEGIN
    PERFORM public.carmen_save_voice_conversation(v_app, '{"role":"user"}');
    RAISE EXCEPTION 'member: messages that are not an array must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- Bounds: a 200-character title and 2000 messages pass; one more of either is refused.
  PERFORM public.carmen_save_voice_conversation(
    v_app,
    (SELECT jsonb_agg(jsonb_build_object('role', 'user', 'content', 'שלום')) FROM generate_series(1, 2000)),
    repeat('א', 200)
  );

  BEGIN
    PERFORM public.carmen_save_voice_conversation(v_app, v_messages, repeat('א', 201));
    RAISE EXCEPTION 'member: a title over 200 characters must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%title longer than 200%' THEN
      RAISE EXCEPTION 'member: the long-title refusal must say why, got %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.carmen_save_voice_conversation(
      v_app,
      (SELECT jsonb_agg(jsonb_build_object('role', 'user', 'content', 'שלום')) FROM generate_series(1, 2001))
    );
    RAISE EXCEPTION 'member: more than 2000 messages must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%more than 2000 messages%' THEN
      RAISE EXCEPTION 'member: the long-transcript refusal must say why, got %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.carmen_save_voice_conversation(
      v_app,
      jsonb_build_array(jsonb_build_object('role', 'user', 'content', repeat('a', 2000001)))
    );
    RAISE EXCEPTION 'member: a transcript over 2 MB must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- The style of the app's organization reads, and only that key; the site's has none.
  SELECT count(*), max(setting_value::text)::jsonb INTO v_rows, v_style
  FROM public.carmen_org_avatar_style(v_app);
  IF v_rows <> 1 OR v_style IS DISTINCT FROM '{"style":"minime"}'::jsonb THEN
    RAISE EXCEPTION 'member: only the app organization style must read, got % rows, %', v_rows, v_style;
  END IF;

  SELECT count(*) INTO v_rows FROM public.carmen_org_avatar_style(v_site);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member: an organization without a style must read no row';
  END IF;
  RESET ROLE;

  SELECT count(*) INTO v_rows FROM public.ai_conversations
  WHERE id = v_id AND user_id = v_member AND tenant_id = v_app AND jsonb_array_length(messages) = 3;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'member: the stored conversation must be theirs, in the app organization, with the update';
  END IF;

  SELECT count(*) INTO v_rows FROM public.ai_conversations
  WHERE id = v_peer_conversation AND messages = '[]';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the colleague''s conversation must be unchanged';
  END IF;

  -- An outsider neither saves nor reads in the app's organization.
  PERFORM pg_temp.qa_sign_in(v_outsider);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.carmen_save_voice_conversation(v_app, v_messages);
    RAISE EXCEPTION 'outsider: saving in a foreign tenant must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.carmen_save_voice_conversation(v_app, v_messages, NULL, v_id);
    RAISE EXCEPTION 'outsider: updating in a foreign tenant must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_rows FROM public.carmen_org_avatar_style(v_app);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'outsider: a foreign tenant style must read no row';
  END IF;
  RESET ROLE;

  -- Anon may call neither function.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.carmen_save_voice_conversation(v_app, v_messages);
    RAISE EXCEPTION 'anon: saving must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.carmen_org_avatar_style(v_app);
    RAISE EXCEPTION 'anon: reading the style must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'carmen_app_organization: all checks passed';
END
$test$;

ROLLBACK;
