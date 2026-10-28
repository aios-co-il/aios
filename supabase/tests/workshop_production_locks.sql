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

ROLLBACK;
