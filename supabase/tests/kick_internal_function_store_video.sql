-- kick_internal_function (20261113090000_kick_meeting_bot_store_video): the
-- service role may queue meeting-bot-store-video, other names stay rejected,
-- and only the service role may call it. Without Vault secrets the call stops
-- at 'kick secrets missing', which is past the allowlist. Rolled back.
BEGIN;
CREATE TEMP TABLE kick_qa_results (test text, passed boolean) ON COMMIT DROP;

DO $test$
DECLARE
  message text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  BEGIN
    PERFORM public.kick_internal_function('meeting-bot-store-video', '{}'::jsonb);
    message := 'queued';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
  END;
  INSERT INTO kick_qa_results VALUES ('meeting-bot-store-video is allowlisted', message <> 'invalid function');

  BEGIN
    PERFORM public.kick_internal_function('meeting-bot-reconcile', '{}'::jsonb);
    message := 'queued';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
  END;
  INSERT INTO kick_qa_results VALUES ('other functions stay rejected', message = 'invalid function');

  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.kick_internal_function('meeting-bot-store-video', '{}'::jsonb);
    message := 'queued';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
  END;
  INSERT INTO kick_qa_results VALUES ('non-service callers denied', message = 'permission denied');

  PERFORM set_config('request.jwt.claims', '', true);
END;
$test$;

INSERT INTO kick_qa_results SELECT 'authenticated cannot execute',
  NOT has_function_privilege('authenticated', 'public.kick_internal_function(text,jsonb)', 'EXECUTE');

DO $$ BEGIN IF EXISTS (SELECT 1 FROM kick_qa_results WHERE NOT passed) THEN
  RAISE EXCEPTION 'kick_internal_function regression failed: %',
    (SELECT jsonb_agg(to_jsonb(r)) FROM kick_qa_results r WHERE NOT passed);
END IF; END $$;
SELECT * FROM kick_qa_results;
ROLLBACK;
