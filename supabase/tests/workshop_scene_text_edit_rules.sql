-- Scene text edit rules (20261026103251_workshop_scene_text_edit_rules, kept with the member
-- check in 20261026103257_workshop_scene_text_edit_member_rules): synthetic work items, assets
-- and scenes inside one transaction that is rolled back, signed in as a tenant member
-- (authenticated role). A changed line marks the clip stale exactly as Carmen's
-- workshop_update_scene does (scene-update.ts): only a clip that says the line itself (an engine
-- that speaks, not in the chosen voice), or a clip that talked and has no line any more, is made
-- again. Staging only: needs a non-admin tenant member.
BEGIN;
DO $stale$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_speaks uuid;
  v_mute uuid;
  v_still uuid;
  v_clip uuid;
  v_native uuid := gen_random_uuid();
  v_chosen uuid := gen_random_uuid();
  v_same_line uuid := gen_random_uuid();
  v_narrated uuid := gen_random_uuid();
  v_footage uuid := gen_random_uuid();
  v_lipsynced uuid := gen_random_uuid();
  v_silenced uuid := gen_random_uuid();
  r public.marketing_video_scenes;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Requires a non-admin tenant member'; END IF;
  -- One film on an engine that speaks (OpenRouter Veo), one on an engine that cannot (Kling).
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK scene text rules', 'draft',
          '{"workshop":{},"video":{"scene_engine":"openrouter"}}')
  RETURNING id INTO v_speaks;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK scene text rules (kling)', 'draft',
          '{"workshop":{},"video":{"scene_engine":"kling"}}')
  RETURNING id INTO v_mute;
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url)
  VALUES (v_tenant, v_speaks, 'still', 'qa/still.png') RETURNING id INTO v_still;
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url)
  VALUES (v_tenant, v_speaks, 'clip', 'qa/clip.mp4') RETURNING id INTO v_clip;
  INSERT INTO public.marketing_video_scenes (
    id, tenant_id, item_id, position, still_asset_id, clip_asset_id, voiceover_text, meta
  ) VALUES
    (v_native, v_tenant, v_speaks, 1, v_still, v_clip, '', '{"lipsync":true,"dialogue":"שורה ישנה"}'),
    (v_chosen, v_tenant, v_speaks, 2, v_still, v_clip, '',
     '{"lipsync":true,"dialogue":"שורה ישנה","chosen_voice":true}'),
    (v_same_line, v_tenant, v_speaks, 3, v_still, v_clip, 'קריינות', '{"lipsync":true,"dialogue":"שורה"}'),
    (v_narrated, v_tenant, v_speaks, 4, v_still, v_clip, 'קריינות ישנה', '{}'),
    (v_footage, v_tenant, v_speaks, 5, NULL, v_clip, '', '{"lipsync":true,"dialogue":"שורה ישנה"}'),
    (v_lipsynced, v_tenant, v_mute, 1, v_still, v_clip, '', '{"lipsync":true,"dialogue":"שורה ישנה"}'),
    (v_silenced, v_tenant, v_mute, 2, v_still, v_clip, '', '{"lipsync":true,"dialogue":"שורה ישנה"}');
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;

  -- The engine says the line itself: a new line makes that clip again.
  r := public.workshop_edit_scene_text(v_native, NULL, NULL, 'שורה חדשה');
  IF NOT r.clip_stale THEN
    RAISE EXCEPTION 'stale: a clip that says its line must be made again (%)', r.meta;
  END IF;

  -- In the chosen voice the clip stays silent: the line is lip-synced again, the clip kept.
  r := public.workshop_edit_scene_text(v_chosen, NULL, NULL, 'שורה חדשה');
  IF r.clip_stale THEN RAISE EXCEPTION 'stale: a chosen-voice line keeps its clip'; END IF;

  -- On-screen text, and narration under a talking scene's own dialogue: the line is the same.
  r := public.workshop_edit_scene_text(v_same_line, 'כיתוב', 'קריינות אחרת');
  IF r.clip_stale THEN RAISE EXCEPTION 'stale: the same line keeps its clip'; END IF;

  -- A narrated scene does not talk: its narration is recorded again, the clip kept.
  r := public.workshop_edit_scene_text(v_narrated, NULL, 'קריינות חדשה');
  IF r.clip_stale THEN RAISE EXCEPTION 'stale: a new narration keeps the clip'; END IF;

  -- The user's own video is never made again.
  r := public.workshop_edit_scene_text(v_footage, NULL, NULL, 'שורה חדשה');
  IF r.clip_stale THEN RAISE EXCEPTION 'stale: the user''s own video is kept'; END IF;

  -- An engine that cannot speak: the new line goes through the lip-sync pass, the clip kept.
  r := public.workshop_edit_scene_text(v_lipsynced, NULL, NULL, 'שורה חדשה');
  IF r.clip_stale THEN RAISE EXCEPTION 'stale: a lip-synced line keeps its clip'; END IF;

  -- A clip that talked and has no line any more is made again, on any engine.
  r := public.workshop_edit_scene_text(v_silenced, NULL, NULL, '');
  IF NOT r.clip_stale THEN
    RAISE EXCEPTION 'stale: a clip that talked and has no line must be made again';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE 'workshop_scene_text_edit_rules: stale checks passed';
END;
$stale$;

-- While the film is being produced its scenes are not edited: the production would lip-sync a
-- new line, or miss its narration, with nothing priced for it. produce_video's own lock: status
-- running, started within the hour.
DO $running$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_item uuid;
  v_scene uuid := gen_random_uuid();
  v_failed boolean;
  r public.marketing_video_scenes;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Requires a non-admin tenant member'; END IF;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK scene text during production', 'draft',
          jsonb_build_object('workshop', '{}'::jsonb, 'video', jsonb_build_object(
            'production', jsonb_build_object('status', 'running', 'started_at', now()))))
  RETURNING id INTO v_item;
  INSERT INTO public.marketing_video_scenes (id, tenant_id, item_id, position, overlay_text, voiceover_text, meta)
  VALUES (v_scene, v_tenant, v_item, 1, 'ישן', 'קריינות ישנה', '{"lipsync":true,"dialogue":"שורה ישנה"}');
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.workshop_edit_scene_text(v_scene, 'חדש', 'קריינות חדשה', 'שורה חדשה');
    v_failed := false;
  EXCEPTION WHEN object_in_use THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'running: an edit during the production must be refused'; END IF;
  SELECT * INTO r FROM public.marketing_video_scenes WHERE id = v_scene;
  IF r.overlay_text <> 'ישן' OR r.voiceover_text <> 'קריינות ישנה' OR r.meta->>'dialogue' <> 'שורה ישנה' THEN
    RAISE EXCEPTION 'running: a refused edit changes nothing (%)', r;
  END IF;

  -- A production marked running for over an hour holds nothing (it was cut off).
  RESET ROLE;
  UPDATE public.marketing_work_items
     SET payload = jsonb_set(payload, '{video,production,started_at}', to_jsonb(now() - interval '2 hours'))
   WHERE id = v_item;
  SET LOCAL ROLE authenticated;
  r := public.workshop_edit_scene_text(v_scene, NULL, 'קריינות חדשה');
  IF r.voiceover_text <> 'קריינות חדשה' THEN RAISE EXCEPTION 'running: a cut-off production holds nothing'; END IF;

  -- A finished production holds nothing either.
  RESET ROLE;
  UPDATE public.marketing_work_items
     SET payload = jsonb_set(payload, '{video,production}', '{"status":"done"}')
   WHERE id = v_item;
  SET LOCAL ROLE authenticated;
  r := public.workshop_edit_scene_text(v_scene, 'חדש');
  IF r.overlay_text <> 'חדש' THEN RAISE EXCEPTION 'running: a finished production holds nothing'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE 'workshop_scene_text_edit_rules: production checks passed';
END;
$running$;
ROLLBACK;
