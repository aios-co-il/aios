-- Video and workshop functions on shared helpers (20261104110000_video_db_functions_consolidate):
-- synthetic tenants, users and projects inside one transaction that is rolled back. The sound,
-- narration and mirror checks pass on the definitions before that migration too (no behaviour
-- change); produce_video's options and workshop_creative_stage's tenant check are new.
BEGIN;

-- A project of p_tenant on the workshop board, with three scenes: two narrated lines (the second
-- with spaces to trim) and one without text.
CREATE FUNCTION pg_temp.qa_film(p_tenant uuid, p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_item uuid;
BEGIN
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (p_tenant, 'QA ROLLBACK video helpers', 'draft',
          public.workshop_department_stage(p_tenant, NULL, 'campaigns', 'creative'), p_payload)
  RETURNING id INTO v_item;
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, voiceover_text, duration_s)
  VALUES (p_tenant, v_item, 1, 'פתיחה', 'שלום', 4),
         (p_tenant, v_item, 2, '', E'  עולם \n', 3),
         (p_tenant, v_item, 3, 'סגיר', '', 2);
  RETURN v_item;
END;
$$;

-- The scene of p_item at p_position.
CREATE FUNCTION pg_temp.qa_scene(p_item uuid, p_position numeric) RETURNS uuid
LANGUAGE sql AS $$
  SELECT id FROM public.marketing_video_scenes WHERE item_id = p_item AND position = p_position
$$;

-- Narration: one continuous take without a talking scene, one voice per narrated scene with one,
-- and ready only while the takes read the current lines in the project's voice.
DO $sound$
DECLARE
  v_tenant uuid;
  v_item uuid;
  v_ids uuid[];
  v_asset uuid;
  r public.marketing_runs;
  v_count integer;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK video helpers', 'qa-rollback-video-' || gen_random_uuid())
  RETURNING id INTO v_tenant;
  v_item := pg_temp.qa_film(v_tenant, '{"workshop":{},"video":{"voice_id":"v1"}}');
  SELECT array_agg(id ORDER BY position) INTO v_ids FROM public.marketing_video_scenes WHERE item_id = v_item;

  IF public.video_narration_ready(v_item) THEN
    RAISE EXCEPTION 'narration: a script with no take is not ready';
  END IF;

  SELECT * INTO r FROM public.queue_video_sound(v_item, 'voice', v_ids, 'elevenlabs', '{"usd":1}', NULL, NULL, ' v1 ');
  IF r.id IS NULL OR r.scene_id IS NOT NULL OR r.input->>'voiceover_text' <> 'שלום עולם'
     OR r.input->'scene_ids' <> to_jsonb(v_ids[1:2]) OR r.input->>'voice_id' <> 'v1'
     OR NOT (r.input->>'continuous')::boolean OR (r.input->'estimate'->>'usd')::numeric <> 1
     OR (r.input->'estimate'->>'per_run')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'voice: one continuous take of the narrated scenes in order (%)', r.input;
  END IF;
  SELECT count(*) INTO v_count FROM public.queue_video_sound(v_item, 'voice', v_ids);
  IF v_count <> 0 THEN RAISE EXCEPTION 'voice: a queued take is not queued again'; END IF;

  -- The take arrives: ready in the project's voice, not ready once the project picks another.
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta)
  VALUES (v_tenant, v_item, 'narration', 'https://example.com/n.mp3',
          '{"text":"שלום עולם","provider":"elevenlabs","voice_id":"v1"}');
  IF NOT public.video_narration_ready(v_item) THEN
    RAISE EXCEPTION 'narration: the newest take of the whole script in the project voice is ready';
  END IF;
  UPDATE public.marketing_work_items SET payload = jsonb_set(payload, '{video,voice_id}', '"v2"') WHERE id = v_item;
  IF public.video_narration_ready(v_item) THEN
    RAISE EXCEPTION 'narration: a take in another voice is not ready';
  END IF;
  UPDATE public.marketing_runs SET status = 'failed' WHERE item_id = v_item;

  -- A talking scene: each narrated scene gets its own voice, and only where its take is not current.
  UPDATE public.marketing_video_scenes SET meta = '{"lipsync":"true","dialogue":"היי"}' WHERE id = v_ids[3];
  IF public.video_narration_ready(v_item) THEN
    RAISE EXCEPTION 'narration: a talking film without scene voices is not ready';
  END IF;
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta)
  VALUES (v_tenant, v_item, 'voiceover', 'https://example.com/s1.mp3',
          '{"text":"שלום","provider":"elevenlabs","voice_id":"v2"}')
  RETURNING id INTO v_asset;
  UPDATE public.marketing_video_scenes SET voice_asset_id = v_asset WHERE id = v_ids[1];
  SELECT count(*) INTO v_count FROM public.queue_video_sound(v_item, 'voice', v_ids);
  IF v_count <> 1 OR (SELECT scene_id FROM public.marketing_runs
                       WHERE item_id = v_item AND kind = 'voice' AND status = 'queued') <> v_ids[2] THEN
    RAISE EXCEPTION 'voice: with a talking scene only the scene without a current take is voiced (%)', v_count;
  END IF;
  IF (SELECT input->>'voiceover_text' FROM public.marketing_runs
       WHERE item_id = v_item AND kind = 'voice' AND status = 'queued') <> 'עולם' THEN
    RAISE EXCEPTION 'voice: a scene voice reads its own trimmed line';
  END IF;
  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta)
  VALUES (v_tenant, v_item, 'voiceover', 'https://example.com/s2.mp3',
          '{"text":"עולם","provider":"elevenlabs","voice_id":"v2"}')
  RETURNING id INTO v_asset;
  UPDATE public.marketing_video_scenes SET voice_asset_id = v_asset WHERE id = v_ids[2];
  IF NOT public.video_narration_ready(v_item) THEN
    RAISE EXCEPTION 'narration: a talking film with a current voice per scene is ready';
  END IF;

  -- Music: one bed as long as the storyboard, with the default prompt.
  SELECT * INTO r FROM public.queue_video_sound(v_item, 'music');
  IF r.input->>'music_length_ms' <> '9000' OR r.input->>'prompt' NOT LIKE 'Instrumental%' THEN
    RAISE EXCEPTION 'music: one bed for the storyboard (%)', r.input;
  END IF;

  RAISE NOTICE 'video_db_functions_consolidate: sound checks passed';
END;
$sound$;

-- The board mirror: a still fills its scene's pending picture, a film its pending page, a clip
-- adds a page, and an asset never writes into another tenant's project.
DO $mirror$
DECLARE
  v_tenant uuid;
  v_other uuid;
  v_item uuid;
  v_scene uuid;
  v_still_page uuid;
  v_film_page uuid;
  v_asset uuid;
  a public.workshop_artifacts;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK mirror', 'qa-rollback-mirror-' || gen_random_uuid()) RETURNING id INTO v_tenant;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK mirror other', 'qa-rollback-mirror-' || gen_random_uuid()) RETURNING id INTO v_other;
  v_item := pg_temp.qa_film(v_tenant, '{"workshop":{}}');
  v_scene := pg_temp.qa_scene(v_item, 1);
  INSERT INTO public.workshop_artifacts (tenant_id, item_id, kind, status, meta)
  VALUES (v_tenant, v_item, 'scene_still', 'pending', jsonb_build_object('scene_id', v_scene, 'placeholder', true))
  RETURNING id INTO v_still_page;
  INSERT INTO public.workshop_artifacts (tenant_id, item_id, kind, status, meta)
  VALUES (v_tenant, v_item, 'film', 'pending', '{"note":"x"}') RETURNING id INTO v_film_page;

  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta)
  VALUES (v_tenant, v_item, 'video_still', 'https://example.com/s.png', jsonb_build_object('scene_id', v_scene))
  RETURNING id INTO v_asset;
  SELECT * INTO a FROM public.workshop_artifacts WHERE id = v_still_page;
  IF a.status <> 'ready' OR a.url <> 'https://example.com/s.png' OR a.thumb_url <> a.url
     OR a.ref_id <> v_asset OR a.meta ? 'placeholder' OR a.meta->>'asset_type' <> 'video_still'
     OR a.meta->>'scene_id' <> v_scene::text THEN
    RAISE EXCEPTION 'mirror: a still fills its pending picture (%)', row_to_json(a);
  END IF;

  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url)
  VALUES (v_tenant, v_item, 'render', 'https://example.com/f.mp4') RETURNING id INTO v_asset;
  SELECT * INTO a FROM public.workshop_artifacts WHERE id = v_film_page;
  IF a.status <> 'ready' OR a.url <> 'https://example.com/f.mp4' OR a.thumb_url IS NOT NULL
     OR a.meta <> jsonb_build_object('note', 'x', 'asset_id', v_asset) THEN
    RAISE EXCEPTION 'mirror: a film fills its pending page (%)', row_to_json(a);
  END IF;

  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta)
  VALUES (v_tenant, v_item, 'video_clip', 'https://example.com/c.mp4',
          jsonb_build_object('scene_id', v_scene, 'provider', 'kling'))
  RETURNING id INTO v_asset;
  SELECT * INTO a FROM public.workshop_artifacts WHERE ref_id = v_asset;
  IF a.kind <> 'clip' OR a.title <> 'הנפשה · סצנה 1 · פתיחה' OR a.folder <> 'video/scenes'
     OR a.thumb_url IS NOT NULL OR a.meta->>'provider' <> 'kling' THEN
    RAISE EXCEPTION 'mirror: a clip adds its page (%)', row_to_json(a);
  END IF;

  INSERT INTO public.marketing_assets (tenant_id, item_id, type, url)
  VALUES (v_other, v_item, 'render', 'https://example.com/other.mp4') RETURNING id INTO v_asset;
  IF EXISTS (SELECT 1 FROM public.workshop_artifacts WHERE ref_id = v_asset) THEN
    RAISE EXCEPTION 'mirror: an asset of another tenant writes nothing into the project';
  END IF;

  IF has_function_privilege('authenticated', 'public.workshop_settle_pending_artifact(uuid, uuid, text, text, text[], jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.workshop_pending_artifact(uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'mirror: the page helpers are internal to the trigger';
  END IF;

  RAISE NOTICE 'video_db_functions_consolidate: mirror checks passed';
END;
$mirror$;

-- produce_video's options do what its old arguments did, and the old signature still works.
DO $produce$
DECLARE
  v_tenant uuid;
  v_item uuid;
  v_twin uuid;
  v_scene uuid;
  v_still uuid;
  v_clip uuid;
  v_stage uuid;
  v_result jsonb;
  v_failed boolean;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK produce', 'qa-rollback-produce-' || gen_random_uuid()) RETURNING id INTO v_tenant;
  v_stage := public.workshop_department_stage(v_tenant, NULL, 'campaigns', 'creative');

  FOREACH v_item IN ARRAY ARRAY[pg_temp.qa_film(v_tenant, '{}'), pg_temp.qa_film(v_tenant, '{}')] LOOP
    v_scene := pg_temp.qa_scene(v_item, 1);
    INSERT INTO public.marketing_assets (tenant_id, item_id, type, url)
    VALUES (v_tenant, v_item, 'video_still', 'https://example.com/still.png') RETURNING id INTO v_still;
    INSERT INTO public.marketing_assets (tenant_id, item_id, type, url, meta)
    VALUES (v_tenant, v_item, 'video_clip', 'https://example.com/mock.mp4', '{"provider":"mock"}')
    RETURNING id INTO v_clip;
    UPDATE public.marketing_video_scenes SET still_asset_id = v_still, clip_asset_id = v_clip, status = 'clip_ready'
     WHERE id = v_scene;
    v_twin := coalesce(v_twin, v_item);
  END LOOP;

  -- New options: a paid engine redoes the free-preview clip only with redo_preview.
  v_result := public.produce_video(v_item, jsonb_build_object(
    'aspect', '16:9', 'provider', 'kling', 'stage_id', v_stage, 'with_voice', false,
    'with_music', false, 'estimate', jsonb_build_object('clips', jsonb_build_object('usd', 2)),
    'redo_preview', true));
  IF (v_result->>'clips')::int <> 1 OR (v_result->>'voices')::int <> 0 OR (v_result->>'music')::int <> 0 THEN
    RAISE EXCEPTION 'produce: options queue the redone clip only (%)', v_result;
  END IF;
  IF (SELECT payload->'video'->'production' @> '{"aspect":"16:9","provider":"kling","with_voice":false}'
        FROM public.marketing_work_items WHERE id = v_item) IS NOT TRUE
     OR (SELECT (input->'estimate'->>'usd')::numeric FROM public.marketing_runs WHERE item_id = v_item AND kind = 'clip') <> 2
     OR (SELECT input->>'aspect' FROM public.marketing_runs WHERE item_id = v_item AND kind = 'clip') <> '16:9' THEN
    RAISE EXCEPTION 'produce: options reach the production and its clip';
  END IF;

  -- The old arguments, through the wrapper: no redo_preview, so the preview clip stays.
  v_result := public.produce_video(v_twin, '16:9', 'kling', '{}'::jsonb, v_stage, false, false);
  IF (v_result->>'clips')::int <> 0 THEN
    RAISE EXCEPTION 'produce: without redo_preview the preview clip stays (%)', v_result;
  END IF;

  -- Defaults: narration and music are queued for a film that lacks them; the lock holds after.
  UPDATE public.marketing_work_items SET payload = '{}' WHERE id = v_twin;
  v_result := public.produce_video(v_twin, jsonb_build_object('stage_id', v_stage));
  IF (v_result->>'voices')::int <> 1 OR (v_result->>'music')::int <> 1 THEN
    RAISE EXCEPTION 'produce: by default narration and music are queued (%)', v_result;
  END IF;
  IF (SELECT payload->'video'->'production'->>'aspect' FROM public.marketing_work_items WHERE id = v_twin) <> '9:16' THEN
    RAISE EXCEPTION 'produce: the default aspect is 9:16';
  END IF;
  v_result := public.produce_video(v_twin, '{}'::jsonb);
  IF v_result <> '{"status":"running","clips":0,"voices":0,"music":0}' THEN
    RAISE EXCEPTION 'produce: a running production queues nothing (%)', v_result;
  END IF;

  -- An unknown option or a non-object is refused.
  BEGIN
    PERFORM public.produce_video(v_twin, '{"aspekt":"1:1"}'::jsonb);
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'produce: an unknown option must be refused'; END IF;
  BEGIN
    PERFORM public.produce_video(v_twin, '[]'::jsonb);
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'produce: options that are not an object must be refused'; END IF;

  IF has_function_privilege('anon', 'public.produce_video(uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.produce_video(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'produce: signed-in callers only, never anon';
  END IF;

  RAISE NOTICE 'video_db_functions_consolidate: produce_video checks passed';
END;
$produce$;

-- workshop_creative_stage answers for the tenant the caller works in (a member's active tenant,
-- or the one a super admin acts in) and for the service role. Any other tenant is refused by its
-- own check, before anything is read or created there (before, only the pipelines' policies
-- stopped it, deep inside workshop_department_stage).
CREATE FUNCTION pg_temp.qa_stage_refusal(p_tenant uuid) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.workshop_creative_stage(p_tenant);
  RETURN NULL;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN SQLERRM;
END;
$$;

-- Signs in as p_user (authenticated role), or clears the sign-in when null.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
           CASE WHEN p_user IS NULL THEN '' ELSE jsonb_build_object('sub', p_user, 'role', 'authenticated')::text END,
           true),
         set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
$$;

DO $stage$
DECLARE
  v_member uuid := gen_random_uuid();
  v_both uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_a uuid;
  v_b uuid;
  v_stage uuid;
  v_refusal text;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-creative-stage-' || u || '@example.invalid' FROM unnest(ARRAY[v_member, v_both, v_admin]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK stage A', 'qa-rollback-stage-' || gen_random_uuid()) RETURNING id INTO v_a;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK stage B', 'qa-rollback-stage-' || gen_random_uuid()) RETURNING id INTO v_b;
  INSERT INTO public.tenant_users (tenant_id, user_id, role)
  VALUES (v_a, v_member, 'member'), (v_a, v_both, 'member'), (v_b, v_both, 'member');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin, 'super_admin');
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_member, v_a), (v_both, v_b), (v_admin, v_b);

  -- A member of A: A's stage; B is refused and gets no pipeline.
  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_a) s;
  IF v_stage IS NULL THEN RAISE EXCEPTION 'stage: a member gets their tenant''s creative stage'; END IF;
  v_refusal := pg_temp.qa_stage_refusal(v_b);
  IF v_refusal IS NULL OR v_refusal NOT LIKE 'workshop_creative_stage:%' THEN
    RAISE EXCEPTION 'stage: another tenant must be refused by the tenant check, got %', coalesce(v_refusal, 'no refusal');
  END IF;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.marketing_pipelines WHERE tenant_id = v_b) THEN
    RAISE EXCEPTION 'stage: a refused call creates no pipeline in the other tenant';
  END IF;

  -- A member of A and B working in B: B only.
  PERFORM pg_temp.qa_sign_in(v_both);
  SET LOCAL ROLE authenticated;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_b) s;
  IF v_stage IS NULL THEN RAISE EXCEPTION 'stage: a member gets the stage of the tenant they work in'; END IF;
  v_refusal := pg_temp.qa_stage_refusal(v_a);
  IF v_refusal IS NULL OR v_refusal NOT LIKE 'workshop_creative_stage:%' THEN
    RAISE EXCEPTION 'stage: a tenant the member does not work in now is refused, got %', coalesce(v_refusal, 'no refusal');
  END IF;
  RESET ROLE;

  -- A super admin acting in B: B only.
  PERFORM pg_temp.qa_sign_in(v_admin);
  SET LOCAL ROLE authenticated;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_b) s;
  IF v_stage IS NULL THEN RAISE EXCEPTION 'stage: a super admin acting in B gets B''s stage'; END IF;
  v_refusal := pg_temp.qa_stage_refusal(v_a);
  IF v_refusal IS NULL OR v_refusal NOT LIKE 'workshop_creative_stage:%' THEN
    RAISE EXCEPTION 'stage: a super admin is refused outside the tenant they act in, got %', coalesce(v_refusal, 'no refusal');
  END IF;
  RESET ROLE;

  -- The service role (edge functions) passes the tenant it resolved.
  PERFORM pg_temp.qa_sign_in(NULL);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT s.stage_id INTO v_stage FROM public.workshop_creative_stage(v_a) s;
  IF v_stage IS NULL THEN RAISE EXCEPTION 'stage: the service role gets the stage'; END IF;
  RESET ROLE;
  PERFORM pg_temp.qa_sign_in(NULL);

  RAISE NOTICE 'video_db_functions_consolidate: creative stage checks passed';
END;
$stage$;

ROLLBACK;
