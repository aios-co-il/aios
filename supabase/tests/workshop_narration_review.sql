-- The narration review (20261105170000_workshop_narration_review): synthetic rows inside one
-- transaction that is rolled back, signed in as a tenant member (authenticated role).
-- workshop_pronunciations: a member reads and writes only their own tenant's words, one row per
-- word, and cannot change or remove another tenant's. workshop_narration_take: a pronunciation
-- saved after the newest take's voice run started (not its file) for a word in its script, or a
-- changed or removed one the take used, marks it changed; a word the script does not say, or says
-- only inside another word, does not; a prefix letter before the word still counts. A pronunciation
-- saved after the newest voice run was queued is reported. Another tenant's project reads as
-- null. anon cannot call it.
BEGIN;
DO $test$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_item uuid;
  v_run uuid;
  v_stage uuid;
  v_other_tenant uuid;
  v_other_item uuid;
  v_take jsonb;
  v_failed boolean;
  v_seen integer;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Requires a non-admin tenant member'; END IF;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK narration other', 'qa-narration-other-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_other_tenant;
  INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken)
  VALUES (v_other_tenant, 'סוד', 'סוֹד');
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_other_tenant, 'QA ROLLBACK narration other', 'draft', '{"project_type":"video"}')
  RETURNING id INTO v_other_item;

  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK narration', 'draft', '{"project_type":"video"}')
  RETURNING id INTO v_item;
  -- The newest take read "קופי, מדיה, מְכִירוֹת ודאטה." with no pronunciation: its voice run
  -- started three hours ago and its file was saved an hour ago.
  SELECT stage_id INTO v_stage FROM public.workshop_creative_stage(v_tenant, NULL);
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, created_at, started_at)
  VALUES (v_tenant, v_item, v_stage, 'voice', 'completed', now() - interval '3 hours', now() - interval '3 hours')
  RETURNING id INTO v_run;
  INSERT INTO public.marketing_assets (tenant_id, item_id, run_id, type, url, meta, created_at)
  VALUES (v_tenant, v_item, v_run, 'narration', 'qa/narration.audio',
          '{"text":"קופי, מדיה, מְכִירוֹת ודאטה.","pronunciations":{}}', now() - interval '1 hour');

  IF has_function_privilege('anon', 'public.workshop_narration_take(uuid)', 'execute') THEN
    RAISE EXCEPTION 'anon must not call workshop_narration_take';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;

  v_take := public.workshop_narration_take(v_item);
  IF (v_take->>'pronunciations_changed')::boolean OR v_take->>'asset_id' IS NULL THEN
    RAISE EXCEPTION 'a take with no pronunciations is unchanged (%)', v_take;
  END IF;

  IF public.workshop_narration_take(v_other_item) IS NOT NULL THEN
    RAISE EXCEPTION 'another tenant''s project must read as null';
  END IF;

  -- A member saves a word for their own tenant, once per word; another tenant's stays hidden.
  INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken) VALUES (v_tenant, 'אחר', 'אַחֵר');
  IF (public.workshop_narration_take(v_item)->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'a word the script does not say must not change the take';
  END IF;
  IF (public.workshop_narration_take(v_item)->>'pronunciations_since_last_run')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'a pronunciation saved after the newest voice run is reported';
  END IF;
  -- "מדי" is inside "מדיה": the worker would not say it differently.
  INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken) VALUES (v_tenant, 'מדי', 'מָדַי');
  IF (public.workshop_narration_take(v_item)->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'a word found only inside another word must not change the take';
  END IF;
  -- Saved two hours ago: after the run started, before the file was saved, so the take lacks it.
  INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken, updated_at)
  VALUES (v_tenant, 'מכירות', 'מְכִירוֹת', now() - interval '2 hours');
  IF NOT (public.workshop_narration_take(v_item)->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'a pronunciation saved after the take''s voice run started, for a word it says, changes it';
  END IF;
  DELETE FROM public.workshop_pronunciations WHERE tenant_id = v_tenant AND word = 'מכירות';
  -- "ודאטה" is ו + "דאטה": a prefix letter still names the word.
  INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken) VALUES (v_tenant, 'דאטה', 'דָאטָה');
  IF NOT (public.workshop_narration_take(v_item)->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'a word after a prefix letter changes the take';
  END IF;
  DELETE FROM public.workshop_pronunciations WHERE tenant_id = v_tenant AND word = 'דאטה';
  INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken) VALUES (v_tenant, 'מכירות', 'מְכִירוֹת');
  BEGIN
    INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken) VALUES (v_tenant, 'מכירות', 'מכירוט');
    v_failed := false;
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'one row per word in a tenant'; END IF;
  BEGIN
    INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken) VALUES (v_other_tenant, 'זר', 'זָר');
    v_failed := false;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'another tenant''s words must be refused'; END IF;
  SELECT count(*) INTO v_seen FROM public.workshop_pronunciations WHERE tenant_id = v_other_tenant;
  IF v_seen <> 0 THEN RAISE EXCEPTION 'another tenant''s words must stay hidden'; END IF;
  UPDATE public.workshop_pronunciations SET spoken = 'סַד' WHERE tenant_id = v_other_tenant;
  GET DIAGNOSTICS v_seen = ROW_COUNT;
  IF v_seen <> 0 THEN RAISE EXCEPTION 'another tenant''s words must not change (% rows)', v_seen; END IF;
  DELETE FROM public.workshop_pronunciations WHERE tenant_id = v_other_tenant;
  GET DIAGNOSTICS v_seen = ROW_COUNT;
  IF v_seen <> 0 THEN RAISE EXCEPTION 'another tenant''s words must not be removed (% rows)', v_seen; END IF;

  -- A take that used a pronunciation changes when it changes or is removed.
  RESET ROLE;
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta, created_at)
  VALUES (v_tenant, v_item, 'narration', 'qa/narration-2.audio',
          '{"text":"קופי, מדיה, מכירות ודאטה.","pronunciations":{"מכירות":"מְכִירוֹת"}}', now() + interval '1 minute');
  SET LOCAL ROLE authenticated;
  IF (public.workshop_narration_take(v_item)->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'a take that used the current pronunciation is unchanged';
  END IF;
  UPDATE public.workshop_pronunciations SET spoken = 'מְקִירוֹת' WHERE tenant_id = v_tenant AND word = 'מכירות';
  IF NOT (public.workshop_narration_take(v_item)->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'a changed pronunciation the take used changes it';
  END IF;
  DELETE FROM public.workshop_pronunciations WHERE tenant_id = v_tenant AND word = 'מכירות';
  IF NOT (public.workshop_narration_take(v_item)->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'a removed pronunciation the take used changes it';
  END IF;

  IF public.workshop_narration_take(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'an unknown project has no take';
  END IF;
  RESET ROLE;
  SELECT count(*) INTO v_seen FROM public.workshop_pronunciations WHERE tenant_id = v_other_tenant AND spoken = 'סוֹד';
  IF v_seen <> 1 THEN RAISE EXCEPTION 'another tenant''s word must be left as it was'; END IF;
  RAISE NOTICE 'workshop_narration_review: all checks passed';
END;
$test$;
ROLLBACK;
