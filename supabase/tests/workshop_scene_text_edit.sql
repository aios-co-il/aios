-- Scene text edit (20261026103300_workshop_scene_text_edit): a synthetic work item and scene
-- inside one transaction that is rolled back. Only the texts given change; meta keys written
-- by others survive, and nothing is marked stale.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_item uuid;
  v_scene uuid := gen_random_uuid();
  r public.marketing_video_scenes;
  v_failed boolean;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK scene text edit', 'draft', '{"workshop":{}}')
  RETURNING id INTO v_item;
  INSERT INTO public.marketing_video_scenes (
    id, tenant_id, item_id, position, title, overlay_text, voiceover_text, motion_prompt, clip_stale, meta
  ) VALUES (
    v_scene, v_tenant, v_item, 1, 'פתיחה', 'ישן', 'קריינות ישנה', 'slow push in', false,
    '{"lipsync":true,"dialogue":"שורה ישנה","reference_url":"https://example.com/skin.png"}'
  );

  -- Only the dialogue: the other texts and meta keys stay.
  r := public.workshop_edit_scene_text(v_scene, NULL, NULL, '  שורה חדשה  ');
  IF r.meta->>'dialogue' <> 'שורה חדשה' OR r.overlay_text <> 'ישן' OR r.voiceover_text <> 'קריינות ישנה' THEN
    RAISE EXCEPTION 'edit: only the dialogue should change (%)', r;
  END IF;
  IF r.meta->>'reference_url' <> 'https://example.com/skin.png' OR r.meta->>'lipsync' <> 'true' THEN
    RAISE EXCEPTION 'edit: other meta keys must survive (%)', r.meta;
  END IF;

  -- On-screen text and narration; nothing becomes stale, the motion prompt is untouched.
  r := public.workshop_edit_scene_text(v_scene, 'כבר החלפת 8 קמפיינרים?', 'קריינות חדשה');
  IF r.overlay_text <> 'כבר החלפת 8 קמפיינרים?' OR r.voiceover_text <> 'קריינות חדשה'
     OR r.meta->>'dialogue' <> 'שורה חדשה' OR r.clip_stale OR r.motion_prompt <> 'slow push in' THEN
    RAISE EXCEPTION 'edit: texts change, nothing stale (%)', r;
  END IF;

  -- Nothing to change, or an unknown scene, is refused.
  BEGIN
    PERFORM public.workshop_edit_scene_text(v_scene);
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'edit: an empty call must be refused'; END IF;
  BEGIN
    PERFORM public.workshop_edit_scene_text(gen_random_uuid(), 'x');
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'edit: an unknown scene must be refused'; END IF;

  RAISE NOTICE 'workshop_scene_text_edit: all checks passed';
END;
$test$;
ROLLBACK;
