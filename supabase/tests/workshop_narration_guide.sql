-- The narration in the user's own voice (20261108090000_workshop_narration_guide): synthetic rows
-- inside one transaction that is rolled back, signed in as a tenant member (authenticated role).
-- queue_narration_guide queues one continuous voice run that carries the recording
-- (input.guide_audio) and the chosen voice over the film's whole narration; it refuses a recording
-- outside the project's narration folder in creative-video (another project, another tenant,
-- another bucket, another file name) and a call without a voice, and queues nothing while the
-- narration is being recorded. workshop_narration_take reports a take made from a recording as
-- guide, and a pronunciation saved after it for a word it says does not mark it changed (it does
-- for the narrator's take). anon cannot call queue_narration_guide.
BEGIN;
DO $test$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_item uuid;
  v_other_item uuid;
  v_stage uuid;
  v_run public.marketing_runs;
  v_path text;
  v_refused int := 0;
  v_bad jsonb;
  v_take jsonb;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Requires a non-admin tenant member'; END IF;

  IF has_function_privilege('anon', 'public.queue_narration_guide(uuid, jsonb, text, jsonb, uuid)', 'execute') THEN
    RAISE EXCEPTION 'anon must not call queue_narration_guide';
  END IF;

  SELECT stage_id INTO v_stage FROM public.workshop_creative_stage(v_tenant, NULL);
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK narration guide', 'draft', v_stage,
          '{"project_type":"video","video":{"voice_id":"voice-a"}}')
  RETURNING id INTO v_item;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, current_stage_id, payload)
  VALUES (v_tenant, 'QA ROLLBACK narration guide other', 'draft', v_stage, '{"project_type":"video"}')
  RETURNING id INTO v_other_item;
  INSERT INTO public.marketing_video_scenes (tenant_id, item_id, position, title, voiceover_text, duration_s)
  VALUES (v_tenant, v_item, 1, 'one', 'קופי, מדיה, מכירות.', 3),
         (v_tenant, v_item, 2, 'two', 'כרמן מנהלת את הכול.', 3);
  v_path := v_tenant::text || '/general/' || v_item::text || '/narration/guide-1700000000000.webm';

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;

  FOR v_bad IN SELECT * FROM (VALUES
    (jsonb_build_object('bucket', 'creative-video', 'path', replace(v_path, v_item::text, v_other_item::text))),
    (jsonb_build_object('bucket', 'creative-video', 'path', replace(v_path, v_tenant::text, gen_random_uuid()::text))),
    (jsonb_build_object('bucket', 'carmen-media', 'path', v_path)),
    (jsonb_build_object('bucket', 'creative-video', 'path', replace(v_path, 'guide-1700000000000.webm', 'voice-x.audio'))),
    (jsonb_build_object('bucket', 'creative-video', 'path', replace(v_path, '/general/', '/../')))
  ) AS bad(guide) LOOP
    BEGIN
      PERFORM public.queue_narration_guide(v_item, v_bad, 'voice-a');
    EXCEPTION WHEN invalid_parameter_value THEN
      v_refused := v_refused + 1;
    END;
  END LOOP;
  IF v_refused <> 5 THEN
    RAISE EXCEPTION 'a recording outside the project''s narration folder is refused (% of 5)', v_refused;
  END IF;
  BEGIN
    PERFORM public.queue_narration_guide(v_item, jsonb_build_object('bucket', 'creative-video', 'path', v_path), ' ');
    RAISE EXCEPTION 'a call without a voice must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  SELECT * INTO v_run FROM public.queue_narration_guide(
    v_item, jsonb_build_object('bucket', 'creative-video', 'path', v_path), 'voice-a', '{"usd":0.02}');
  IF v_run.id IS NULL
     OR v_run.kind <> 'voice' OR v_run.scene_id IS NOT NULL
     OR v_run.input->'guide_audio' <> jsonb_build_object('bucket', 'creative-video', 'path', v_path)
     OR v_run.input->>'voice_id' <> 'voice-a'
     OR v_run.input->>'voiceover_text' <> 'קופי, מדיה, מכירות. כרמן מנהלת את הכול.'
     OR (v_run.input->>'continuous')::boolean IS NOT TRUE
     OR (v_run.input->'estimate'->>'per_run')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'the recording is queued as the continuous narration (%)', to_jsonb(v_run);
  END IF;
  IF EXISTS (SELECT 1 FROM public.queue_narration_guide(
       v_item, jsonb_build_object('bucket', 'creative-video', 'path', v_path), 'voice-a')) THEN
    RAISE EXCEPTION 'nothing is queued while the narration is being recorded';
  END IF;

  -- The worker's take of the recording, and a pronunciation saved after it for a word it says.
  RESET ROLE;
  UPDATE public.marketing_runs SET status = 'completed', started_at = now() - interval '1 hour'
   WHERE id = v_run.id;
  INSERT INTO public.marketing_assets (tenant_id, item_id, run_id, type, url, meta, created_at)
  VALUES (v_tenant, v_item, v_run.id, 'narration', v_path,
          jsonb_build_object('text', 'קופי, מדיה, מכירות. כרמן מנהלת את הכול.', 'voice_id', 'voice-a',
                             'source', 'guide', 'pronunciations', '{}'::jsonb),
          now() - interval '30 minutes');
  INSERT INTO public.carmen_pronunciations (tenant_id, term, spoken) VALUES (v_tenant, 'מכירות', 'מְכִירוֹת');
  SET LOCAL ROLE authenticated;
  v_take := public.workshop_narration_take(v_item);
  IF (v_take->>'guide')::boolean IS NOT TRUE
     OR (v_take->>'pronunciations_changed')::boolean
     OR v_take->>'run_id' <> v_run.id::text
     OR (v_take->>'ready')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'a take of the user''s recording is current and reads no pronunciation (%)', v_take;
  END IF;

  -- The narrator's take of the same script does change with that pronunciation.
  RESET ROLE;
  UPDATE public.marketing_assets SET meta = meta - 'source' WHERE run_id = v_run.id;
  SET LOCAL ROLE authenticated;
  v_take := public.workshop_narration_take(v_item);
  IF (v_take->>'guide')::boolean OR NOT (v_take->>'pronunciations_changed')::boolean THEN
    RAISE EXCEPTION 'the narrator''s take changes with a pronunciation it lacks (%)', v_take;
  END IF;
  RESET ROLE;
  RAISE NOTICE 'workshop_narration_guide: all checks passed';
END;
$test$;
ROLLBACK;
