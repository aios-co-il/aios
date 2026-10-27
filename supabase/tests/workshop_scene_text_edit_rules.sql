-- Scene text edit rules (20261026103251_workshop_scene_text_edit_rules): synthetic work items,
-- assets and scenes inside one transaction that is rolled back. A changed line marks the clip
-- stale exactly as Carmen's workshop_update_scene does (scene-update.ts): only a clip that says
-- the line itself (an engine that speaks, not in the chosen voice), or a clip that talked and has
-- no line any more, is made again. Staging only: needs a tenant.
BEGIN;
DO $stale$
DECLARE
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
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
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

  RAISE NOTICE 'workshop_scene_text_edit_rules: stale checks passed';
END;
$stale$;
ROLLBACK;
