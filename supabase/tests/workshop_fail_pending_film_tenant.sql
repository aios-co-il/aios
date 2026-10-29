-- A failed render closes the pending film page of its own tenant only
-- (20261026103255_workshop_cross_tenant_writes): synthetic rows inside one transaction that is
-- rolled back. A render run of another tenant that names the project changes nothing; the
-- project's own failed render closes the page with its reason.
-- Staging only: needs two tenants.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_other uuid;
  v_stage uuid;
  v_item uuid;
  v_film uuid;
  v_run uuid;
  r public.workshop_artifacts;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT id INTO v_other FROM public.tenants WHERE id <> v_tenant ORDER BY id LIMIT 1;
  IF v_other IS NULL THEN RAISE EXCEPTION 'Requires two tenants'; END IF;
  SELECT stage_id INTO v_stage FROM public.workshop_creative_stage(v_tenant, NULL);

  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK pending film', 'draft', '{"workshop":{}}')
  RETURNING id INTO v_item;
  INSERT INTO public.workshop_artifacts (tenant_id, item_id, kind, folder, title, status)
  VALUES (v_tenant, v_item, 'film', 'video/film', 'הסרט', 'pending')
  RETURNING id INTO v_film;

  -- Another tenant's run that names this project fails: the page stays pending, no text lands.
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status)
  VALUES (v_other, v_item, v_stage, 'render', 'running')
  RETURNING id INTO v_run;
  UPDATE public.marketing_runs SET status = 'failed', error = 'טקסט של ארגון אחר' WHERE id = v_run;
  SELECT * INTO r FROM public.workshop_artifacts WHERE id = v_film;
  IF r.status <> 'pending' OR r.meta ? 'error' THEN
    RAISE EXCEPTION 'tenant: another tenant''s run must not close the film page (%, %)', r.status, r.meta;
  END IF;

  -- The project's own failed render closes the page with its reason.
  INSERT INTO public.marketing_runs (tenant_id, item_id, stage_id, kind, status)
  VALUES (v_tenant, v_item, v_stage, 'render', 'running')
  RETURNING id INTO v_run;
  UPDATE public.marketing_runs SET status = 'failed', error = 'אין קליפים להרכבה' WHERE id = v_run;
  SELECT * INTO r FROM public.workshop_artifacts WHERE id = v_film;
  IF r.status <> 'failed' OR r.meta->>'error' IS DISTINCT FROM 'אין קליפים להרכבה' THEN
    RAISE EXCEPTION 'own: the project''s failed render should close its film page (%, %)', r.status, r.meta;
  END IF;

  RAISE NOTICE 'workshop_fail_pending_film_tenant: all checks passed';
END;
$test$;
ROLLBACK;
