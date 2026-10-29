-- Work item payload merge (20261026103220_marketing_work_item_payload_merge): a synthetic
-- work item inside one transaction that is rolled back. A workshop budget written after
-- update_marketing_work_item read the item must survive the patch.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_item uuid;
  v_stale jsonb;
  v_payload jsonb;
  r record;
  v_rows int;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK payload merge', 'draft',
    '{"brief":"old","keep":1,"workshop_budget":{"spent":1},"workshop":{"step":"a"}}')
  RETURNING id INTO v_item;

  -- The tool reads the item, then a workshop run writes a newer budget and state.
  SELECT payload INTO v_stale FROM public.marketing_work_items WHERE id = v_item;
  UPDATE public.marketing_work_items
     SET payload = payload || '{"workshop_budget":{"spent":5},"workshop":{"step":"b"}}'
   WHERE id = v_item;

  -- The patch carries the stale copies of both workshop keys plus a normal key.
  SELECT * INTO r FROM public.patch_marketing_work_item(
    v_item, v_tenant, NULL, 'in_progress',
    jsonb_build_object('brief', 'new', 'workshop_budget', v_stale->'workshop_budget',
      'workshop', v_stale->'workshop'));
  IF r.id IS DISTINCT FROM v_item OR r.title <> 'QA ROLLBACK payload merge' OR r.status <> 'in_progress' THEN
    RAISE EXCEPTION 'patch: returned row must keep the title and set the status (%)', r;
  END IF;
  SELECT payload INTO v_payload FROM public.marketing_work_items WHERE id = v_item;
  IF v_payload->'workshop_budget' <> '{"spent":5}'::jsonb OR v_payload->'workshop' <> '{"step":"b"}'::jsonb THEN
    RAISE EXCEPTION 'patch: the newer workshop budget and state must be kept (%)', v_payload;
  END IF;
  IF v_payload->>'brief' <> 'new' OR v_payload->'keep' <> '1'::jsonb THEN
    RAISE EXCEPTION 'patch: normal keys must merge into the payload (%)', v_payload;
  END IF;

  -- A new title with no status or payload patch leaves both alone.
  SELECT * INTO r FROM public.patch_marketing_work_item(v_item, v_tenant, 'QA ROLLBACK renamed');
  IF r.title <> 'QA ROLLBACK renamed' OR r.status <> 'in_progress'
     OR (SELECT payload FROM public.marketing_work_items WHERE id = v_item) <> v_payload THEN
    RAISE EXCEPTION 'patch: title-only call must keep status and payload (%)', r;
  END IF;

  -- Another tenant gets no row and changes nothing.
  SELECT count(*) INTO v_rows FROM public.patch_marketing_work_item(
    v_item, gen_random_uuid(), 'QA ROLLBACK wrong tenant', 'archived', '{"brief":"x"}');
  IF v_rows <> 0 OR (SELECT title FROM public.marketing_work_items WHERE id = v_item) <> 'QA ROLLBACK renamed' THEN
    RAISE EXCEPTION 'patch: a wrong tenant must not match the item';
  END IF;

  RAISE NOTICE 'marketing_work_item_payload_merge: all checks passed';
END;
$test$;
ROLLBACK;
