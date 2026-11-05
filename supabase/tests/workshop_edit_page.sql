-- Concept and script edits on the workshop board (20261105120000_workshop_concept_script_approval):
-- synthetic work item and pages inside one transaction that is rolled back, signed in as a tenant
-- member (authenticated role). A concept's text changes; a script's texts change with their timing
-- kept, the project's script follows its page and loses its approval, also in a tenant of the
-- member's that is not their active one; a script whose storyboard is written, another kind of
-- page and another tenant's page are refused.
BEGIN;
DO $test$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_item uuid;
  v_concept uuid := gen_random_uuid();
  v_script uuid := gen_random_uuid();
  v_image uuid := gen_random_uuid();
  v_other_tenant uuid;
  v_other_item uuid;
  v_other_script uuid := gen_random_uuid();
  v_beats jsonb := '[{"start_s":0,"end_s":2,"narration":"ישן","on_screen":"כותרת","visual":"פנים"},
                     {"start_s":2,"end_s":5,"narration":"עוד","on_screen":"","visual":"לוח"}]'::jsonb;
  r public.workshop_artifacts;
  v_payload jsonb;
  v_failed boolean;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Requires a non-admin tenant member'; END IF;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK edit page', 'draft', jsonb_build_object(
    'workshop_script', jsonb_build_object(
      'artifact_id', v_script::text, 'title', 'תחלופה', 'total_s', 5, 'concept', 'יום אחד',
      'saved_turn', 'turn-1', 'approved', true, 'approved_turn', 'turn-2',
      'beats', '[{"start_s":0,"end_s":2,"narration":"ישן","on_screen":"כותרת","visual":"פנים"},
                 {"start_s":2,"end_s":5,"narration":"עוד","on_screen":"","visual":"לוח"}]'::jsonb
    )
  ))
  RETURNING id INTO v_item;
  INSERT INTO public.workshop_artifacts (id, tenant_id, item_id, kind, title, status, meta) VALUES
    (v_concept, v_tenant, v_item, 'concept', 'יום אחד', 'ready', '{"text":"מסע של יום"}'),
    (v_script, v_tenant, v_item, 'script', 'תסריט · תחלופה', 'ready', jsonb_build_object(
      'text', 'ישן', 'total_s', 5,
      'beats', '[{"start_s":0,"end_s":2,"narration":"ישן","on_screen":"כותרת","visual":"פנים"},
                 {"start_s":2,"end_s":5,"narration":"עוד","on_screen":"","visual":"לוח"}]'::jsonb)),
    (v_image, v_tenant, v_item, 'image', 'תמונה', 'ready', '{}');
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;

  -- A concept's text changes; its other meta stays.
  r := public.workshop_edit_page(v_concept, '  מסע של לילה  ');
  IF r.meta->>'text' <> 'מסע של לילה' OR r.meta->>'edited_by_user' <> 'true' THEN
    RAISE EXCEPTION 'concept: the text should change (%)', r.meta;
  END IF;

  -- A script's texts change, the timing stays, and the project's script waits for approval again.
  r := public.workshop_edit_page(v_script, 'חדש', '[
    {"start_s":9,"end_s":9,"narration":" חדש ","on_screen":"כותרת","visual":"פנים"},
    {"narration":"עוד","on_screen":"","visual":"לוח"}]'::jsonb);
  IF r.meta->'beats'->0->>'narration' <> 'חדש' OR (r.meta->'beats'->0->>'end_s')::numeric <> 2
     OR (r.meta->'beats'->1->>'start_s')::numeric <> 2 OR r.meta->>'text' <> 'חדש' THEN
    RAISE EXCEPTION 'script: texts change, timing stays (%)', r.meta;
  END IF;
  SELECT payload INTO v_payload FROM public.marketing_work_items WHERE id = v_item;
  IF v_payload->'workshop_script'->'beats' <> r.meta->'beats'
     OR v_payload->'workshop_script'->>'approved' <> 'false'
     OR v_payload->'workshop_script'->'approved_turn' <> 'null'::jsonb
     OR v_payload->'workshop_script'->>'concept' <> 'יום אחד' THEN
    RAISE EXCEPTION 'script: the project script follows the page, unapproved (%)', v_payload;
  END IF;

  -- Another beat count, an empty beat, another kind of page and an unknown page are refused.
  BEGIN
    PERFORM public.workshop_edit_page(v_script, 'x', '[{"narration":"x"}]'::jsonb);
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'script: another beat count must be refused'; END IF;
  BEGIN
    PERFORM public.workshop_edit_page(v_script, 'x', '[{"narration":""},{"narration":"x"}]'::jsonb);
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'script: a beat with no text must be refused'; END IF;
  BEGIN
    PERFORM public.workshop_edit_page(v_image, 'x');
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an image page must be refused'; END IF;
  BEGIN
    PERFORM public.workshop_edit_page(gen_random_uuid(), 'x');
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an unknown page must be refused'; END IF;

  -- Another tenant's page is "not found" until the actor is a member of that tenant too.
  RESET ROLE;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK edit page other', 'qa-edit-page-other-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_other_tenant;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_other_tenant, 'QA ROLLBACK edit page other', 'draft', jsonb_build_object(
    'workshop_script', jsonb_build_object(
      'artifact_id', v_other_script::text, 'title', 'תחלופה', 'total_s', 5, 'concept', 'יום אחד',
      'saved_turn', 'turn-1', 'approved', true, 'approved_turn', 'turn-2', 'beats', v_beats)
  ))
  RETURNING id INTO v_other_item;
  INSERT INTO public.workshop_artifacts (id, tenant_id, item_id, kind, title, status, meta)
  VALUES (v_other_script, v_other_tenant, v_other_item, 'script', 'תסריט · תחלופה', 'ready',
          jsonb_build_object('text', 'ישן', 'total_s', 5, 'beats', v_beats));
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.workshop_edit_page(v_other_script, 'x', '[{"narration":"a"},{"narration":"b"}]'::jsonb);
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'another tenant''s page must be refused'; END IF;

  -- A member of two tenants edits the script in the one that is not active: the project's script
  -- follows the page and waits for approval again (the work item is not readable to them there).
  RESET ROLE;
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_actor, v_tenant)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;
  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES (v_actor, v_other_tenant, 'member');
  IF public.get_user_tenant_id(v_actor) <> v_tenant THEN
    RAISE EXCEPTION 'setup: the actor''s active tenant should stay %', v_tenant;
  END IF;
  SET LOCAL ROLE authenticated;
  r := public.workshop_edit_page(v_other_script, 'חדש', '[
    {"narration":"חדש","on_screen":"כותרת","visual":"פנים"},
    {"narration":"עוד","on_screen":"","visual":"לוח"}]'::jsonb);
  RESET ROLE;
  SELECT payload INTO v_payload FROM public.marketing_work_items WHERE id = v_other_item;
  IF v_payload->'workshop_script'->>'approved' <> 'false'
     OR v_payload->'workshop_script'->'beats'->0->>'narration' <> 'חדש' THEN
    RAISE EXCEPTION 'second tenant: the project script follows the page, unapproved (%)', v_payload;
  END IF;

  -- Once the storyboard is written from the script, the script is not edited.
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title)
  VALUES (v_tenant, v_item, 1, 'פתיחה');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.workshop_edit_page(v_script, 'x', '[{"narration":"a"},{"narration":"b"}]'::jsonb);
    v_failed := false;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'script: a written storyboard must be refused'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE 'workshop_edit_page: all checks passed';
END;
$test$;
ROLLBACK;
