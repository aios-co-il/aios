-- The narration review (20261105170000_workshop_narration_review): synthetic rows inside one
-- transaction that is rolled back, signed in as a tenant member (authenticated role).
-- workshop_pronunciations: a member reads and writes only their own tenant's words, one row per
-- word. workshop_narration_take: a pronunciation saved after the newest take for a word in its
-- script, or a changed or removed one the take used, marks it changed; a word the script does not
-- say does not. anon cannot call it.
BEGIN;
DO $test$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_item uuid;
  v_other_tenant uuid;
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
  VALUES (v_tenant, 'QA ROLLBACK narration', 'draft', '{"project_type":"video"}')
  RETURNING id INTO v_item;
  -- The newest take, an hour old, read "קופי, מדיה, מכירות." with no pronunciation.
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta, created_at)
  VALUES (v_tenant, v_item, 'narration', 'qa/narration.audio',
          '{"text":"קופי, מדיה, מְכִירוֹת.","pronunciations":{}}', now() - interval '1 hour');

  IF has_function_privilege('anon', 'public.workshop_narration_take(uuid)', 'execute') THEN
    RAISE EXCEPTION 'anon must not call workshop_narration_take';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;

  v_take := public.workshop_narration_take(v_item);
  IF (v_take->>'pronunciations_changed')::boolean OR v_take->>'asset_id' IS NULL THEN
    RAISE EXCEPTION 'a take with no pronunciations is unchanged (%)', v_take;
  END IF;

  -- A member saves a word for their own tenant, once per word; another tenant's stays hidden.
  INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken) VALUES (v_tenant, 'אחר', 'אַחֵר');
  IF (public.workshop_narration_take(v_item)->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'a word the script does not say must not change the take';
  END IF;
  INSERT INTO public.workshop_pronunciations (tenant_id, word, spoken) VALUES (v_tenant, 'מכירות', 'מְכִירוֹת');
  IF NOT (public.workshop_narration_take(v_item)->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'a pronunciation newer than the take, for a word it says, changes it';
  END IF;
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

  -- A take that used a pronunciation changes when it changes or is removed.
  RESET ROLE;
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta, created_at)
  VALUES (v_tenant, v_item, 'narration', 'qa/narration-2.audio',
          '{"text":"קופי, מדיה, מכירות.","pronunciations":{"מכירות":"מְכִירוֹת"}}', now() + interval '1 minute');
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
  RAISE NOTICE 'workshop_narration_review: all checks passed';
END;
$test$;
ROLLBACK;
