-- Who may call the workshop and video RPCs (20261026103256_workshop_video_rpc_grants): signed-in
-- members (authenticated) and the service role; never anon, and nothing is granted to PUBLIC.
-- claim_video_run belongs to the render worker (service role only), and the board's
-- workshop_edit_scene_text to signed-in members only. Read-only.
BEGIN;
DO $test$
DECLARE
  v_fn text;
  v_bad text := '';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.video_narration_ready(uuid)',
    'public.attach_video_narration(uuid, text, jsonb, uuid, jsonb)',
    'public.queue_video_sound(uuid, text, uuid[], text, jsonb, uuid, text, text)',
    'public.advance_video_production(uuid)',
    'public.produce_video(uuid, text, text, jsonb, uuid, boolean, boolean, text, text, boolean, boolean)',
    'public.workshop_creative_stage(uuid, uuid)',
    'public.workshop_assign_client(uuid, uuid)',
    'public.video_talking_line(jsonb, text)',
    'public.video_narration_line(jsonb, text)',
    'public.queue_video_lipsync(uuid, uuid[], jsonb, uuid, boolean)',
    'public.save_video_storyboard(uuid, jsonb)',
    'public.video_voice_matches(jsonb, text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN v_bad := v_bad || ' anon:' || v_fn; END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || ' no-authenticated:' || v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || ' no-service_role:' || v_fn;
    END IF;
  END LOOP;

  v_fn := 'public.claim_video_run(text[], text)';
  IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    v_bad := v_bad || ' service-role-only:' || v_fn;
  END IF;
  v_fn := 'public.workshop_edit_scene_text(uuid, text, text, text)';
  IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('service_role', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    v_bad := v_bad || ' authenticated-only:' || v_fn;
  END IF;

  -- Nothing of these is granted to PUBLIC (grantee 0), which every role inherits.
  SELECT v_bad || coalesce(string_agg(' public:' || p.oid::regprocedure::text, ''), '') INTO v_bad
  FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN (
      'video_narration_ready', 'attach_video_narration', 'queue_video_sound', 'advance_video_production',
      'produce_video', 'workshop_creative_stage', 'workshop_assign_client', 'video_talking_line',
      'video_narration_line', 'queue_video_lipsync', 'save_video_storyboard', 'video_voice_matches',
      'claim_video_run', 'workshop_edit_scene_text'
    )
    AND a.grantee = 0
    AND a.privilege_type = 'EXECUTE';

  IF v_bad <> '' THEN RAISE EXCEPTION 'grants:%', v_bad; END IF;
  RAISE NOTICE 'workshop_video_rpc_grants: all checks passed';
END;
$test$;
ROLLBACK;
