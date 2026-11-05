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
  FOR i IN 1..3 LOOP
    INSERT INTO public.marketing_assets (tenant_id, item_id, type, url)
    VALUES (v_tenant, v_item, 'image', 'https://example.com/still.png') RETURNING id INTO v_still;
    INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, still_asset_id)
    VALUES (v_tenant, v_item, i, 'סצנה', v_still) RETURNING id INTO v_scene;
    v_ids := v_ids || v_scene;
  END LOOP;

  PERFORM public.queue_video_clips(v_item, v_ids, '9:16', '{"usd": 1.26, "credits": 30}', v_stage, 'openrouter');

  SELECT jsonb_agg(DISTINCT input->'estimate') INTO v_estimates
    FROM public.marketing_runs WHERE item_id = v_item AND kind = 'clip';
  IF v_estimates <> '[{"usd": 0.42, "credits": 10}]'::jsonb THEN
    RAISE EXCEPTION 'share: each of three clips stores a third of the quote (%)', v_estimates;
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
  VALUES (v_tenant, v_tight, v_stage, 'clip', 'running', 'openrouter', now(), '{"estimate": {"usd": 1.5}}');
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, provider, input)
  VALUES (v_tenant, v_tight, v_stage, 'clip', v_tight_scene, 'queued', 'openrouter', '{"estimate": {"usd": 1}}')
  RETURNING id INTO v_tight_clip;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, provider_job_id, input)
  VALUES (v_tenant, v_tight, v_stage, 'lipsync', 'queued', 'kling', 'qa-job-2', '{"estimate": {"usd": 1}}')
  RETURNING id INTO v_taken;

  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK budget reserve room', 'draft', v_stage, jsonb_build_object(
    'workshop', '{}'::jsonb,
    'workshop_budget', jsonb_build_object('cap_usd', 4, 'spent_usd', 2.5,
      'quoted_usd', jsonb_build_object('workshop_make_stills', 1, 'workshop_produce_video', 2.5))))
  RETURNING id INTO v_room;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, started_at, input)
  VALUES (v_tenant, v_room, v_stage, 'clip', 'running', 'openrouter', now(), '{"estimate": {"usd": 1.5}}');
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, input)
  VALUES (v_tenant, v_room, v_stage, 'clip', 'queued', 'openrouter', '{"estimate": {"usd": 1}}')
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

ROLLBACK;
