-- Clip estimates and the budget claim (20261105140000_workshop_clip_estimate_budget_claim):
-- synthetic rows inside one transaction that is rolled back. Runs as the database owner.
BEGIN;

-- Each clip run stores its share of the quote for the scenes asked for. On Staging (5 Nov) six
-- OpenRouter clips quoted $2.52 together stored $2.52 each.
DO $share$
DECLARE
  v_tenant uuid;
  v_stage uuid;
  v_item uuid;
  v_ids uuid[] := '{}';
  v_scene uuid;
  v_still uuid;
  v_estimates jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_tenant, NULL) s;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK clip share', 'draft', v_stage, '{}') RETURNING id INTO v_item;
  -- Scenes of 1, 2 and 3 seconds: each clip's share follows its length.
  FOR i IN 1..3 LOOP
    INSERT INTO public.marketing_assets (tenant_id, item_id, type, url)
    VALUES (v_tenant, v_item, 'image', 'https://example.com/still.png') RETURNING id INTO v_still;
    INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, still_asset_id, duration_s)
    VALUES (v_tenant, v_item, i, 'סצנה', v_still, i) RETURNING id INTO v_scene;
    v_ids := v_ids || v_scene;
  END LOOP;

  PERFORM public.queue_video_clips(v_item, v_ids, '9:16', '{"usd": 1.26, "credits": 30}', v_stage, 'openrouter');

  SELECT jsonb_agg(run.input->'estimate' ORDER BY scene.position) INTO v_estimates
    FROM public.marketing_runs AS run
    JOIN public.marketing_video_scenes AS scene ON scene.id = run.scene_id
   WHERE run.item_id = v_item AND run.kind = 'clip';
  IF v_estimates <> '[{"usd": 0.21, "credits": 5, "per_run": true},
                      {"usd": 0.42, "credits": 10, "per_run": true},
                      {"usd": 0.63, "credits": 15, "per_run": true}]'::jsonb THEN
    RAISE EXCEPTION 'share: each clip stores its length''s share of the quote (%)', v_estimates;
  END IF;

  RAISE NOTICE 'workshop_clip_estimate_budget_claim: share checks passed';
END;
$share$;

-- A paid job is handed out only while its quote fits in what is left: the pictures, what the
-- runs cost, the quotes of the jobs in flight and its own. Approved $3, pictures $1, a clip
-- running at a $1.50 quote: a queued $1 clip would take it to $3.50, so it is refused; with $4
-- approved it is claimed. A clip a provider already took is never refused.
DO $reserve$
DECLARE
  v_tenant uuid;
  v_stage uuid;
  v_tight uuid;
  v_room uuid;
  v_tight_scene uuid;
  v_tight_clip uuid;
  v_room_clip uuid;
  v_taken uuid;
  v_run public.marketing_runs;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_tenant, NULL) s;
  -- Older due runs would be claimed first; this check needs its own runs at the head.
  UPDATE public.marketing_runs SET status = 'completed' WHERE status IN ('queued', 'running');

  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK budget reserve tight', 'draft', v_stage, jsonb_build_object(
    'workshop', '{}'::jsonb,
    'workshop_budget', jsonb_build_object('cap_usd', 3, 'spent_usd', 2.5,
      'quoted_usd', jsonb_build_object('workshop_make_stills', 1, 'workshop_produce_video', 2.5))))
  RETURNING id INTO v_tight;
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, status)
  VALUES (v_tenant, v_tight, 1, 'צמודה', 'clip_generating') RETURNING id INTO v_tight_scene;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, started_at, input)
  VALUES (v_tenant, v_tight, v_stage, 'clip', 'running', 'openrouter', now(), '{"estimate": {"usd": 1.5, "per_run": true}}');
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, provider, input)
  VALUES (v_tenant, v_tight, v_stage, 'clip', v_tight_scene, 'queued', 'openrouter', '{"estimate": {"usd": 1, "per_run": true}}')
  RETURNING id INTO v_tight_clip;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, provider_job_id, input)
  VALUES (v_tenant, v_tight, v_stage, 'lipsync', 'queued', 'kling', 'qa-job-2', '{"estimate": {"usd": 1, "per_run": true}}')
  RETURNING id INTO v_taken;

  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK budget reserve room', 'draft', v_stage, jsonb_build_object(
    'workshop', '{}'::jsonb,
    'workshop_budget', jsonb_build_object('cap_usd', 4, 'spent_usd', 2.5,
      'quoted_usd', jsonb_build_object('workshop_make_stills', 1, 'workshop_produce_video', 2.5))))
  RETURNING id INTO v_room;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, started_at, input)
  VALUES (v_tenant, v_room, v_stage, 'clip', 'running', 'openrouter', now(), '{"estimate": {"usd": 1.5, "per_run": true}}');
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, input)
  VALUES (v_tenant, v_room, v_stage, 'clip', 'queued', 'openrouter', '{"estimate": {"usd": 1, "per_run": true}}')
  RETURNING id INTO v_room_clip;

  SELECT * INTO v_run FROM public.claim_video_run(ARRAY['clip'], 'qa');

  SELECT * INTO v_run FROM public.marketing_runs WHERE id = v_tight_clip;
  IF v_run.status <> 'failed' OR coalesce(v_run.error, '') NOT LIKE '%התקציב שאושר לפרויקט%' THEN
    RAISE EXCEPTION 'reserve: a clip whose quote does not fit the budget left must be refused (%, %)',
      v_run.status, v_run.error;
  END IF;
  IF (SELECT status FROM public.marketing_video_scenes WHERE id = v_tight_scene) <> 'failed' THEN
    RAISE EXCEPTION 'reserve: the refused clip''s scene is failed';
  END IF;
  SELECT * INTO v_run FROM public.marketing_runs WHERE id = v_room_clip;
  IF v_run.status <> 'running' THEN
    RAISE EXCEPTION 'reserve: a clip that fits the budget left is claimed (%)', v_run.status;
  END IF;

  SELECT * INTO v_run FROM public.claim_video_run(ARRAY['lipsync'], 'qa');
  IF v_run.id IS DISTINCT FROM v_taken THEN
    RAISE EXCEPTION 'reserve: a job a provider already took is claimed, not refused (%)', v_run.status;
  END IF;

  RAISE NOTICE 'workshop_clip_estimate_budget_claim: reserve checks passed';
END;
$reserve$;

-- A talking film: each per-scene voice stores its scene's share of the voice quote (it stored the
-- whole quote on every scene).
DO $voice$
DECLARE
  v_tenant uuid;
  v_stage uuid;
  v_item uuid;
  v_short uuid;
  v_long uuid;
  v_estimates jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_tenant, NULL) s;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK talking voice share', 'draft', v_stage, '{}') RETURNING id INTO v_item;
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, duration_s, voiceover_text, meta)
  VALUES (v_tenant, v_item, 1, 'מדברת', 4, 'שלום לכולם', '{"lipsync": true}');
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, duration_s, voiceover_text)
  VALUES (v_tenant, v_item, 2, 'קצרה', 1, 'קריינות קצרה') RETURNING id INTO v_short;
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, duration_s, voiceover_text)
  VALUES (v_tenant, v_item, 3, 'ארוכה', 3, 'קריינות ארוכה יותר') RETURNING id INTO v_long;

  PERFORM public.queue_video_sound(v_item, 'voice', ARRAY[v_short, v_long], 'elevenlabs', '{"usd": 0.4}', v_stage);

  SELECT jsonb_agg(input->'estimate' ORDER BY input->>'voiceover_text') INTO v_estimates
    FROM public.marketing_runs WHERE item_id = v_item AND kind = 'voice';
  IF v_estimates <> '[{"usd": 0.3, "per_run": true}, {"usd": 0.1, "per_run": true}]'::jsonb THEN
    RAISE EXCEPTION 'voice share: each scene''s voice stores its length''s share (%)', v_estimates;
  END IF;

  RAISE NOTICE 'workshop_clip_estimate_budget_claim: voice share checks passed';
END;
$voice$;

-- Two talking scenes lip-synced within the quote: approved $3, pictures $1, lip sync quoted $2
-- for both. Each pass stores its scene's share ($0.50 for 2 s, $1.50 for 6 s), so the second is
-- claimed while the first runs; with the whole $2 on each it was refused at $5. A pass queued
-- again after the other finished keeps its share.
DO $lipsync$
DECLARE
  v_tenant uuid;
  v_stage uuid;
  v_item uuid;
  v_short uuid;
  v_long uuid;
  v_asset uuid;
  v_first public.marketing_runs;
  v_second public.marketing_runs;
  v_estimates jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_tenant, NULL) s;
  UPDATE public.marketing_runs SET status = 'completed' WHERE status IN ('queued', 'running');

  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK lipsync share', 'draft', v_stage, jsonb_build_object(
    'workshop', '{}'::jsonb,
    'video', jsonb_build_object('production', jsonb_build_object('status', 'running', 'started_at', now())),
    'workshop_budget', jsonb_build_object('cap_usd', 3, 'spent_usd', 0,
      'quoted_usd', jsonb_build_object('workshop_make_stills', 1, 'workshop_produce_video', 2))))
  RETURNING id INTO v_item;
  FOR i IN 1..2 LOOP
    INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, duration_s, voiceover_text, meta)
    VALUES (v_tenant, v_item, i, 'מדברת', CASE i WHEN 1 THEN 2 ELSE 6 END, 'שורה ' || i, '{"lipsync": true}')
    RETURNING id INTO v_asset;
    IF i = 1 THEN v_short := v_asset; ELSE v_long := v_asset; END IF;
  END LOOP;
  -- Each scene has its still and a voice of exactly its line.
  FOR i IN 1..2 LOOP
    INSERT INTO public.marketing_assets (tenant_id, item_id, type, url)
    VALUES (v_tenant, v_item, 'image', 'https://example.com/still.png') RETURNING id INTO v_asset;
    UPDATE public.marketing_video_scenes SET still_asset_id = v_asset
     WHERE id = CASE i WHEN 1 THEN v_short ELSE v_long END;
    INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta)
    VALUES (v_tenant, v_item, 'voiceover', 'https://example.com/voice.mp3', jsonb_build_object('text', 'שורה ' || i))
    RETURNING id INTO v_asset;
    UPDATE public.marketing_video_scenes SET voice_asset_id = v_asset
     WHERE id = CASE i WHEN 1 THEN v_short ELSE v_long END;
  END LOOP;

  PERFORM public.queue_video_lipsync(v_item, ARRAY[v_short, v_long], '{"usd": 2}', v_stage, false);

  SELECT jsonb_agg(run.input->'estimate' ORDER BY scene.position) INTO v_estimates
    FROM public.marketing_runs AS run
    JOIN public.marketing_video_scenes AS scene ON scene.id = run.scene_id
   WHERE run.item_id = v_item AND run.kind = 'lipsync';
  IF v_estimates <> '[{"usd": 0.5, "per_run": true}, {"usd": 1.5, "per_run": true}]'::jsonb THEN
    RAISE EXCEPTION 'lipsync share: each pass stores its length''s share of the quote (%)', v_estimates;
  END IF;

  SELECT * INTO v_first FROM public.claim_video_run(ARRAY['lipsync'], 'qa');
  SELECT * INTO v_second FROM public.claim_video_run(ARRAY['lipsync'], 'qa');
  IF v_first.item_id IS DISTINCT FROM v_item OR v_second.item_id IS DISTINCT FROM v_item
     OR v_first.id = v_second.id THEN
    RAISE EXCEPTION 'lipsync reserve: both passes are claimed within the quote (%, %)',
      (SELECT jsonb_agg(jsonb_build_object('status', status, 'error', error))
         FROM public.marketing_runs WHERE item_id = v_item AND kind = 'lipsync'), v_second.id;
  END IF;

  -- The short scene's pass finished (its clip now speaks its line); the long one failed and is
  -- queued again on its own: it still stores its share, not the whole quote.
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta)
  VALUES (v_tenant, v_item, 'clip', 'https://example.com/clip.mp4', '{"lipsync": "true", "dialogue": "שורה 1"}')
  RETURNING id INTO v_asset;
  UPDATE public.marketing_video_scenes SET clip_asset_id = v_asset WHERE id = v_short;
  UPDATE public.marketing_runs SET status = 'completed', cost_usd = 0.5 WHERE item_id = v_item AND scene_id = v_short;
  UPDATE public.marketing_runs SET status = 'failed' WHERE item_id = v_item AND scene_id = v_long;
  PERFORM public.queue_video_lipsync(v_item, ARRAY[v_long], '{"usd": 2}', v_stage, true);
  SELECT input->'estimate' INTO v_estimates
    FROM public.marketing_runs WHERE item_id = v_item AND scene_id = v_long AND status = 'queued';
  IF v_estimates <> '{"usd": 1.5, "per_run": true}'::jsonb THEN
    RAISE EXCEPTION 'lipsync share: a pass queued after another finished keeps its share (%)', v_estimates;
  END IF;

  RAISE NOTICE 'workshop_clip_estimate_budget_claim: lipsync checks passed';
END;
$lipsync$;

-- A run queued before this migration holds the whole film's estimate (no per_run): it counts at
-- its cost only, so it neither blocks a job that fits nor is refused for its stale quote.
DO $legacy$
DECLARE
  v_tenant uuid;
  v_stage uuid;
  v_item uuid;
  v_new uuid;
  v_old uuid;
  v_run public.marketing_runs;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_tenant, NULL) s;
  UPDATE public.marketing_runs SET status = 'completed' WHERE status IN ('queued', 'running');

  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK legacy estimate', 'draft', v_stage, jsonb_build_object(
    'workshop', '{}'::jsonb,
    'workshop_budget', jsonb_build_object('cap_usd', 3, 'spent_usd', 0,
      'quoted_usd', jsonb_build_object('workshop_make_stills', 1))))
  RETURNING id INTO v_item;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, started_at, input)
  VALUES (v_tenant, v_item, v_stage, 'clip', 'running', 'openrouter', now(), '{"estimate": {"usd": 5}}');
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, input)
  VALUES (v_tenant, v_item, v_stage, 'clip', 'queued', 'openrouter', '{"estimate": {"usd": 1, "per_run": true}}')
  RETURNING id INTO v_new;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, input)
  VALUES (v_tenant, v_item, v_stage, 'clip', 'queued', 'openrouter', '{"estimate": {"usd": 5}}')
  RETURNING id INTO v_old;

  PERFORM public.claim_video_run(ARRAY['clip'], 'qa');
  PERFORM public.claim_video_run(ARRAY['clip'], 'qa');
  SELECT * INTO v_run FROM public.marketing_runs WHERE id = v_new;
  IF v_run.status <> 'running' THEN
    RAISE EXCEPTION 'legacy: an old run''s whole-film quote does not block a job that fits (%, %)',
      v_run.status, v_run.error;
  END IF;
  SELECT * INTO v_run FROM public.marketing_runs WHERE id = v_old;
  IF v_run.status <> 'running' THEN
    RAISE EXCEPTION 'legacy: an old run is claimed while the recorded spend is under the budget (%, %)',
      v_run.status, v_run.error;
  END IF;

  RAISE NOTICE 'workshop_clip_estimate_budget_claim: legacy checks passed';
END;
$legacy$;

ROLLBACK;
