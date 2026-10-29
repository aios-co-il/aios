-- Production locks (20261026103258_workshop_production_locks): synthetic rows inside one
-- transaction that is rolled back. Runs as the database owner.
BEGIN;

-- While the film is being produced no new storyboard is saved: the running production's paid
-- runs belong to the scenes it has. produce_video's own lock, as for a scene's text: status
-- running, started within the hour.
DO $storyboard$
DECLARE
  v_tenant uuid;
  v_item uuid;
  v_scene uuid := gen_random_uuid();
  v_failed boolean;
  v_title text;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK storyboard during production', 'draft',
          jsonb_build_object('workshop', '{}'::jsonb, 'video', jsonb_build_object(
            'production', jsonb_build_object('status', 'running', 'started_at', now()))))
  RETURNING id INTO v_item;
  INSERT INTO public.marketing_video_scenes (id, tenant_id, item_id, position, title)
  VALUES (v_scene, v_tenant, v_item, 1, 'ישנה');

  BEGIN
    PERFORM public.save_video_storyboard(v_item, jsonb_build_array(
      jsonb_build_object('id', v_scene, 'position', 1, 'title', 'חדשה'),
      jsonb_build_object('id', gen_random_uuid(), 'position', 2, 'title', 'נוספת')));
    v_failed := false;
  EXCEPTION WHEN object_in_use THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'storyboard: a save during the production must be refused'; END IF;
  SELECT title INTO v_title FROM public.marketing_video_scenes WHERE id = v_scene;
  IF v_title <> 'ישנה' OR (SELECT count(*) FROM public.marketing_video_scenes WHERE item_id = v_item) <> 1 THEN
    RAISE EXCEPTION 'storyboard: a refused save changes nothing (%)', v_title;
  END IF;

  -- A production marked running for over an hour holds nothing (it was cut off).
  UPDATE public.marketing_work_items
     SET payload = jsonb_set(payload, '{video,production,started_at}', to_jsonb(now() - interval '2 hours'))
   WHERE id = v_item;
  PERFORM public.save_video_storyboard(v_item, jsonb_build_array(
    jsonb_build_object('id', v_scene, 'position', 1, 'title', 'חדשה')));
  SELECT title INTO v_title FROM public.marketing_video_scenes WHERE id = v_scene;
  IF v_title <> 'חדשה' THEN RAISE EXCEPTION 'storyboard: a cut-off production holds nothing'; END IF;

  -- A finished production holds nothing either.
  UPDATE public.marketing_work_items
     SET payload = jsonb_set(payload, '{video,production}', '{"status":"done"}')
   WHERE id = v_item;
  PERFORM public.save_video_storyboard(v_item, jsonb_build_array(
    jsonb_build_object('id', v_scene, 'position', 1, 'title', 'אחרי ההפקה')));
  SELECT title INTO v_title FROM public.marketing_video_scenes WHERE id = v_scene;
  IF v_title <> 'אחרי ההפקה' THEN RAISE EXCEPTION 'storyboard: a finished production holds nothing'; END IF;

  RAISE NOTICE 'workshop_production_locks: storyboard checks passed';
END;
$storyboard$;

-- An asset's address opens as a link and shows as a picture, and a board page's address plays
-- as its picture, video or sound: only what the app writes is stored, never javascript: or
-- data: written straight through the API. Assets: http(s) only. Pages: http(s), or a path in
-- the project's storage (the board signs it to show it).
DO $links$
DECLARE
  v_tenant uuid;
  v_item uuid;
  v_bad text;
  v_refused boolean;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK asset links', 'draft', '{"workshop":{}}')
  RETURNING id INTO v_item;

  -- What the app writes.
  INSERT INTO public.workshop_assets (tenant_id, item_id, asset_type, url) VALUES
    (v_tenant, v_item, 'link', 'https://example.com/page'),
    (v_tenant, v_item, 'site', 'http://example.com'),
    (v_tenant, v_item, 'image', 'https://p.supabase.co/storage/v1/object/public/entity-attachments/a/b.png'),
    (v_tenant, v_item, 'text', NULL);
  INSERT INTO public.workshop_artifacts (tenant_id, item_id, kind, url, thumb_url) VALUES
    (v_tenant, v_item, 'image', 'https://p.supabase.co/storage/v1/object/public/x/y.png',
     'https://p.supabase.co/storage/v1/object/public/x/y.png'),
    (v_tenant, v_item, 'clip', v_tenant || '/' || v_item || '/clip.mp4', NULL),
    (v_tenant, v_item, 'narration', v_tenant || '/voices/sample.mp3', NULL),
    (v_tenant, v_item, 'brief', NULL, NULL);

  FOREACH v_bad IN ARRAY ARRAY[
    'javascript:alert(1)', ' javascript:alert(1)', 'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>', '//evil.example/x', 'evil.example/page'
  ] LOOP
    BEGIN
      INSERT INTO public.workshop_assets (tenant_id, item_id, asset_type, url)
      VALUES (v_tenant, v_item, 'link', v_bad);
      v_refused := false;
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'links: an asset address % must be refused', v_bad; END IF;
  END LOOP;

  FOREACH v_bad IN ARRAY ARRAY[
    'javascript:alert(1)', ' javascript:alert(1)', E'java\tscript:alert(1)',
    'data:image/svg+xml,<svg onload=alert(1)>', '//evil.example/x', '/etc/passwd'
  ] LOOP
    BEGIN
      INSERT INTO public.workshop_artifacts (tenant_id, item_id, kind, url)
      VALUES (v_tenant, v_item, 'image', v_bad);
      v_refused := false;
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'links: a page address % must be refused', v_bad; END IF;
    BEGIN
      INSERT INTO public.workshop_artifacts (tenant_id, item_id, kind, thumb_url)
      VALUES (v_tenant, v_item, 'image', v_bad);
      v_refused := false;
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'links: a page thumbnail % must be refused', v_bad; END IF;
  END LOOP;

  -- An update cannot slip one in either.
  BEGIN
    UPDATE public.workshop_assets SET url = 'javascript:alert(1)' WHERE item_id = v_item AND asset_type = 'link';
    v_refused := false;
  EXCEPTION WHEN check_violation THEN v_refused := true;
  END;
  IF NOT v_refused THEN RAISE EXCEPTION 'links: an updated asset address must be refused'; END IF;

  RAISE NOTICE 'workshop_production_locks: link checks passed';
END;
$links$;

-- Real spend stays within the approved budget: once what a project's pictures were charged and
-- what its runs really cost reach the budget the user approved, claim_video_run hands no new
-- paid job to a worker. The job ends failed with the budget error, its scene too, and the
-- production moves on as after any failed scene. Free preview clips, a job a provider already
-- took (resumed at no new cost), and projects without a workshop budget are claimed as before.
DO $budget$
DECLARE
  v_tenant uuid;
  v_stage uuid;
  v_spent uuid;
  v_room uuid;
  v_plain uuid;
  v_alone uuid;
  v_scene uuid;
  v_alone_scene uuid;
  v_alone_clip uuid;
  v_paid uuid;
  v_voice uuid;
  v_preview uuid;
  v_taken uuid;
  v_within uuid;
  v_other uuid;
  v_run public.marketing_runs;
  v_prod jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_tenant, NULL) s;

  -- Approved $5: the stills were charged $1 and a finished clip really cost $4.20.
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK budget spent', 'draft', v_stage, jsonb_build_object(
    'workshop', '{}'::jsonb,
    'workshop_budget', jsonb_build_object('cap_usd', 5, 'spent_usd', 3.5,
      'quoted_usd', jsonb_build_object('workshop_make_stills', 1, 'workshop_produce_video', 2.5))))
  RETURNING id INTO v_spent;
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, status)
  VALUES (v_tenant, v_spent, 1, 'מונפשת', 'clip_generating') RETURNING id INTO v_scene;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, cost_usd, finished_at)
  VALUES (v_tenant, v_spent, v_stage, 'clip', 'completed', 'kling', 4.2, now());
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, provider)
  VALUES (v_tenant, v_spent, v_stage, 'clip', v_scene, 'queued', 'kling') RETURNING id INTO v_paid;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider)
  VALUES (v_tenant, v_spent, v_stage, 'voice', 'queued', 'elevenlabs') RETURNING id INTO v_voice;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider)
  VALUES (v_tenant, v_spent, v_stage, 'clip', 'queued', 'mock') RETURNING id INTO v_preview;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, provider_job_id)
  VALUES (v_tenant, v_spent, v_stage, 'lipsync', 'queued', 'kling', 'qa-job-1') RETURNING id INTO v_taken;

  -- A production whose narration really cost the whole $2 budget, its only clip still to come.
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK budget spent mid-production', 'draft', v_stage, jsonb_build_object(
    'workshop', '{}'::jsonb,
    'workshop_budget', jsonb_build_object('cap_usd', 2, 'spent_usd', 2,
      'quoted_usd', jsonb_build_object('workshop_produce_video', 2)),
    'video', jsonb_build_object('production', jsonb_build_object(
      'status', 'running', 'started_at', now(), 'with_voice', false))))
  RETURNING id INTO v_alone;
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, status)
  VALUES (v_tenant, v_alone, 1, 'יקרה', 'clip_generating') RETURNING id INTO v_alone_scene;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, cost_usd, finished_at)
  VALUES (v_tenant, v_alone, v_stage, 'voice', 'completed', 'elevenlabs', 2, now());
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, provider)
  VALUES (v_tenant, v_alone, v_stage, 'clip', v_alone_scene, 'queued', 'kling') RETURNING id INTO v_alone_clip;

  -- Approved $10 with the same spend: room is left.
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK budget room', 'draft', v_stage, jsonb_build_object(
    'workshop', '{}'::jsonb,
    'workshop_budget', jsonb_build_object('cap_usd', 10, 'spent_usd', 3.5,
      'quoted_usd', jsonb_build_object('workshop_make_stills', 1))))
  RETURNING id INTO v_room;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, cost_usd)
  VALUES (v_tenant, v_room, v_stage, 'clip', 'completed', 'kling', 4.2);
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider)
  VALUES (v_tenant, v_room, v_stage, 'music', 'queued', 'elevenlabs') RETURNING id INTO v_within;

  -- A project outside the workshop has no workshop budget.
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK no workshop budget', 'draft', v_stage, '{}')
  RETURNING id INTO v_plain;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, cost_usd)
  VALUES (v_tenant, v_plain, v_stage, 'clip', 'completed', 'kling', 40);
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider)
  VALUES (v_tenant, v_plain, v_stage, 'clip', 'queued', 'kling') RETURNING id INTO v_other;

  SELECT * INTO v_run FROM public.claim_video_run(ARRAY['clip', 'voice', 'music', 'lipsync'], 'qa');

  FOR v_run IN SELECT * FROM public.marketing_runs WHERE id IN (v_paid, v_voice, v_alone_clip) LOOP
    IF v_run.status <> 'failed' OR coalesce(v_run.error, '') NOT LIKE '%התקציב שאושר לפרויקט נוצל%' THEN
      RAISE EXCEPTION 'budget: a paid % over the approved budget must end failed with the budget error (%, %)',
        v_run.kind, v_run.status, v_run.error;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.marketing_video_scenes WHERE id IN (v_scene, v_alone_scene) AND status::text <> 'failed'
  ) THEN
    RAISE EXCEPTION 'budget: the scene of a clip refused for the budget is failed';
  END IF;
  -- Its only clip refused, the production ends as after a failed scene: no clips to assemble.
  SELECT payload->'video'->'production' INTO v_prod FROM public.marketing_work_items WHERE id = v_alone;
  IF v_prod->>'status' <> 'failed' OR coalesce(v_prod->>'error', '') <> 'no clips to assemble' THEN
    RAISE EXCEPTION 'budget: the production moves on after the refused clip (%)', v_prod;
  END IF;
  FOR v_run IN SELECT * FROM public.marketing_runs WHERE id IN (v_preview, v_taken, v_within, v_other) LOOP
    IF v_run.status = 'failed' THEN
      RAISE EXCEPTION 'budget: % (% %) is not refused', v_run.id, v_run.kind, v_run.provider;
    END IF;
  END LOOP;

  RAISE NOTICE 'workshop_production_locks: budget checks passed';
END;
$budget$;

ROLLBACK;
