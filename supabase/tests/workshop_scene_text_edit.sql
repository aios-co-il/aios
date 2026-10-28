-- Scene text edit (20261026103240_workshop_scene_text_edit, member check in
-- 20261026103255_workshop_cross_tenant_writes): synthetic work items and scenes inside one
-- transaction that is rolled back, signed in as a tenant member (authenticated role). Only the
-- texts given change, within their limits; meta keys written by others survive, and nothing is
-- marked stale. The scene of another tenant is not found and stays as it was, also for a super
-- admin, who reads every tenant's scenes but changes none outside their own (TENANT_ISOLATION.md).
-- Staging only: needs a non-admin tenant member and a tenant they do not belong to.
BEGIN;
DO $test$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_item uuid;
  v_scene uuid := gen_random_uuid();
  r public.marketing_video_scenes;
  v_failed boolean;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Requires a non-admin tenant member'; END IF;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK scene text edit', 'draft', '{"workshop":{}}')
  RETURNING id INTO v_item;
  INSERT INTO public.marketing_video_scenes (
    id, tenant_id, item_id, position, title, overlay_text, voiceover_text, motion_prompt, clip_stale, meta
  ) VALUES (
    v_scene, v_tenant, v_item, 1, 'פתיחה', 'ישן', 'קריינות ישנה', 'slow push in', false,
    '{"lipsync":true,"dialogue":"שורה ישנה","reference_url":"https://example.com/skin.png"}'
  );
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;

  -- Only the dialogue: the other texts and meta keys stay.
  r := public.workshop_edit_scene_text(v_scene, NULL, NULL, '  שורה חדשה  ');
  IF r.meta->>'dialogue' <> 'שורה חדשה' OR r.overlay_text <> 'ישן' OR r.voiceover_text <> 'קריינות ישנה' THEN
    RAISE EXCEPTION 'edit: only the dialogue should change (%)', r;
  END IF;
  IF r.meta->>'reference_url' <> 'https://example.com/skin.png' OR r.meta->>'lipsync' <> 'true' THEN
    RAISE EXCEPTION 'edit: other meta keys must survive (%)', r.meta;
  END IF;

  -- On-screen text and narration; nothing becomes stale, the motion prompt is untouched.
  r := public.workshop_edit_scene_text(v_scene, 'כבר החלפת 8 קמפיינרים?', 'קריינות חדשה');
  IF r.overlay_text <> 'כבר החלפת 8 קמפיינרים?' OR r.voiceover_text <> 'קריינות חדשה'
     OR r.meta->>'dialogue' <> 'שורה חדשה' OR r.clip_stale OR r.motion_prompt <> 'slow push in' THEN
    RAISE EXCEPTION 'edit: texts change, nothing stale (%)', r;
  END IF;

  -- Nothing to change, or an unknown scene, is refused.
  BEGIN
    PERFORM public.workshop_edit_scene_text(v_scene);
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'edit: an empty call must be refused'; END IF;
  BEGIN
    PERFORM public.workshop_edit_scene_text(gen_random_uuid(), 'x');
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'edit: an unknown scene must be refused'; END IF;

  -- Texts past their limits are cut, as workshop_update_scene cuts them.
  r := public.workshop_edit_scene_text(v_scene, repeat('א', 400), repeat('ב', 2500), repeat('ג', 1200));
  IF length(r.overlay_text) <> 300 OR length(r.voiceover_text) <> 2000
     OR length(r.meta->>'dialogue') <> 1000 THEN
    RAISE EXCEPTION 'edit: texts keep their limits (%, %, %)',
      length(r.overlay_text), length(r.voiceover_text), length(r.meta->>'dialogue');
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE 'workshop_scene_text_edit: all checks passed';
END;
$test$;

-- As a signed-in tenant member: their own scene changes, another tenant's is not found.
DO $tenant$
DECLARE
  v_actor uuid;
  v_own_tenant uuid;
  v_other_tenant uuid;
  v_own_item uuid;
  v_other_item uuid;
  v_own uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  r public.marketing_video_scenes;
  v_failed boolean;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_own_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  SELECT id INTO v_other_tenant FROM public.tenants WHERE id <> v_own_tenant LIMIT 1;
  IF v_actor IS NULL OR v_other_tenant IS NULL THEN
    RAISE EXCEPTION 'Requires a non-admin tenant member and a second tenant';
  END IF;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_own_tenant, 'QA ROLLBACK own scene', 'draft', '{}') RETURNING id INTO v_own_item;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_other_tenant, 'QA ROLLBACK other scene', 'draft', '{}') RETURNING id INTO v_other_item;
  INSERT INTO public.marketing_video_scenes (id, tenant_id, item_id, position, title, overlay_text)
  VALUES (v_own, v_own_tenant, v_own_item, 1, 'שלי', 'ישן'),
         (v_other, v_other_tenant, v_other_item, 1, 'של אחר', 'ישן');

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;
  r := public.workshop_edit_scene_text(v_own, 'חדש');
  IF r.overlay_text <> 'חדש' THEN
    RAISE EXCEPTION 'tenant: the own scene should change (%)', r.overlay_text;
  END IF;
  BEGIN
    PERFORM public.workshop_edit_scene_text(v_other, 'נפרץ');
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF NOT v_failed THEN
    RAISE EXCEPTION 'tenant: another tenant''s scene must not be found';
  END IF;
  IF (SELECT overlay_text FROM public.marketing_video_scenes WHERE id = v_other) <> 'ישן' THEN
    RAISE EXCEPTION 'tenant: another tenant''s scene must stay as it was';
  END IF;

  RAISE NOTICE 'workshop_scene_text_edit: tenant checks passed';
END;
$tenant$;

-- As a super admin (made one inside this transaction): another tenant's scene can be read but
-- not changed; it is not found and stays as it was.
DO $admin$
DECLARE
  v_actor uuid;
  v_other_tenant uuid;
  v_other_item uuid;
  v_other uuid := gen_random_uuid();
  v_seen integer;
  v_failed boolean;
BEGIN
  SELECT tu.user_id INTO v_actor
  FROM public.tenant_users tu
  WHERE NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  SELECT t.id INTO v_other_tenant
  FROM public.tenants t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = v_actor AND tu.tenant_id = t.id
  )
  LIMIT 1;
  IF v_actor IS NULL OR v_other_tenant IS NULL THEN
    RAISE EXCEPTION 'Requires a tenant member and a tenant they do not belong to';
  END IF;
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (v_actor, 'super_admin', NULL);
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_other_tenant, 'QA ROLLBACK admin scene', 'draft', '{}') RETURNING id INTO v_other_item;
  INSERT INTO public.marketing_video_scenes (id, tenant_id, item_id, position, title, overlay_text)
  VALUES (v_other, v_other_tenant, v_other_item, 1, 'של ארגון אחר', 'ישן');

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_seen FROM public.marketing_video_scenes WHERE id = v_other;
  BEGIN
    PERFORM public.workshop_edit_scene_text(v_other, 'נערך בידי מנהל');
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_seen <> 1 THEN
    RAISE EXCEPTION 'admin: a super admin should read another tenant''s scene (setup)';
  END IF;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'admin: a super admin must not change another tenant''s scene';
  END IF;
  IF (SELECT overlay_text FROM public.marketing_video_scenes WHERE id = v_other) <> 'ישן' THEN
    RAISE EXCEPTION 'admin: another tenant''s scene must stay as it was';
  END IF;

  RAISE NOTICE 'workshop_scene_text_edit: super admin checks passed';
END;
$admin$;
ROLLBACK;
