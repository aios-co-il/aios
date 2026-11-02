-- Production without a stage (20261026103254_video_production_stage_guard): synthetic rows
-- inside one transaction that is rolled back. A talking scene of a project with no stage cannot
-- be lip-synced: the production fails with the reason instead of raising. When moving one
-- abandoned production on raises anyway, claim_video_run still fails the run and goes on, so
-- the worker keeps claiming for every tenant. A project taken off its client keeps the
-- tenant's "no client" creative stage, as a project made without a client gets it.
-- Runs as the database owner (claim_video_run is service-role only).
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_pipeline uuid;
  v_stage uuid;
  v_item uuid;
  v_broken uuid;
  v_still uuid;
  v_stale uuid;
  v_state text;
  v_prod jsonb;
  v_failed boolean;
  v_error text;
  r public.marketing_work_items;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  SELECT s.pipeline_id, s.stage_id INTO v_pipeline, v_stage
  FROM public.workshop_creative_stage(v_tenant, NULL) s;

  -- A producing film whose talking scene still needs its lip sync, on a project with no stage.
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK production without stage', 'draft', NULL,
          '{"workshop":{},"video":{"production":{"status":"running","with_voice":false}}}')
  RETURNING id INTO v_item;
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url)
  VALUES (v_tenant, v_item, 'video_still', 'qa/still.png') RETURNING id INTO v_still;
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, still_asset_id, meta)
  VALUES (v_tenant, v_item, 1, 'מדבר', v_still, '{"lipsync":true,"dialogue":"שלום לכולם"}');

  v_state := public.advance_video_production(v_item);
  SELECT payload->'video'->'production' INTO v_prod FROM public.marketing_work_items WHERE id = v_item;
  IF v_state <> 'failed' OR v_prod->>'status' <> 'failed'
     OR coalesce(v_prod->>'error', '') NOT LIKE '%has no stage%' THEN
    RAISE EXCEPTION 'advance: a lip sync without a stage should fail the production with its reason (%, %)',
      v_state, v_prod;
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketing_runs WHERE item_id = v_item) THEN
    RAISE EXCEPTION 'advance: nothing is queued for a production without a stage';
  END IF;

  -- A production that cannot be moved on (with_voice is not a boolean) and an abandoned run of it.
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK unreadable production', 'draft', v_stage,
          '{"workshop":{},"video":{"production":{"status":"running","with_voice":"maybe"}}}')
  RETURNING id INTO v_broken;
  BEGIN
    PERFORM public.advance_video_production(v_broken);
    v_failed := false;
  EXCEPTION WHEN invalid_text_representation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'setup: moving this production on should raise';
  END IF;
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status, started_at, attempts)
  VALUES (v_tenant, v_broken, v_stage, 'music', 'running', now() - interval '2 hours', 3)
  RETURNING id INTO v_stale;

  BEGIN
    PERFORM public.claim_video_run(ARRAY['music'], 'qa');
    v_failed := false;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error := SQLERRM;
  END;
  IF v_failed THEN
    RAISE EXCEPTION 'claim: one production that cannot move on must not stop the claim (%)', v_error;
  END IF;
  IF (SELECT status FROM public.marketing_runs WHERE id = v_stale) <> 'failed' THEN
    RAISE EXCEPTION 'claim: the abandoned run should be failed';
  END IF;

  -- Taken off its client, a project keeps the "no client" creative stage.
  r := public.workshop_assign_client(v_item, NULL);
  IF r.client_id IS NOT NULL OR r.pipeline_id IS DISTINCT FROM v_pipeline
     OR r.current_stage_id IS DISTINCT FROM v_stage THEN
    RAISE EXCEPTION 'assign: without a client the project goes to the "no client" stage (%, %)',
      r.pipeline_id, r.current_stage_id;
  END IF;

  RAISE NOTICE 'video_production_stage_guard: all checks passed';
END;
$test$;
ROLLBACK;
