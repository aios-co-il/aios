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

ROLLBACK;
