-- Reliable WhatsApp → automation dispatch (AIO-204):
-- 20261102110000_automation_executions_close_and_retention. Synthetic rows
-- inside one transaction that is rolled back. The claim and dispatch
-- statements are the ones green-api-webhook's message-claim.ts and
-- automation-dispatch.ts send through PostgREST; the retention statements are
-- read from cron.job when pg_cron is installed.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_claim text := 'qa-line:QA-ROLLBACK-1';
  v_claimed_at timestamptz;
  v_rows int;
  v_command text;
BEGIN
  -- Lease column ------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'processed_webhook_messages'
      AND column_name = 'completed_at'
      AND data_type = 'timestamp with time zone'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'processed_webhook_messages.completed_at must be a nullable timestamptz';
  END IF;

  -- Message claim: one delivery owns it ------------------------------------
  INSERT INTO public.processed_webhook_messages (provider, tenant_id, external_message_id)
  VALUES ('green_api', v_tenant, v_claim);
  BEGIN
    INSERT INTO public.processed_webhook_messages (provider, tenant_id, external_message_id)
    VALUES ('green_api', v_tenant, v_claim);
    RAISE EXCEPTION 'claim: a redelivery must hit unique_violation';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- Stale takeover: compare-and-set on processed_at, unfinished claims only.
  UPDATE public.processed_webhook_messages
  SET processed_at = now() - interval '10 minutes'
  WHERE provider = 'green_api' AND tenant_id = v_tenant AND external_message_id = v_claim
  RETURNING processed_at INTO v_claimed_at;

  UPDATE public.processed_webhook_messages
  SET processed_at = now()
  WHERE provider = 'green_api' AND tenant_id = v_tenant AND external_message_id = v_claim
    AND processed_at = v_claimed_at AND completed_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'lease: a stale unfinished claim must be taken over once, got %', v_rows;
  END IF;

  UPDATE public.processed_webhook_messages
  SET processed_at = now()
  WHERE provider = 'green_api' AND tenant_id = v_tenant AND external_message_id = v_claim
    AND processed_at = v_claimed_at AND completed_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'lease: a second retry must lose the takeover, got %', v_rows;
  END IF;

  -- Complete, then a failure's release leaves the stored message's claim.
  UPDATE public.processed_webhook_messages
  SET completed_at = now()
  WHERE provider = 'green_api' AND tenant_id = v_tenant AND external_message_id = v_claim;

  DELETE FROM public.processed_webhook_messages
  WHERE provider = 'green_api' AND tenant_id = v_tenant AND external_message_id = v_claim
    AND completed_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'release: a completed claim must not be released';
  END IF;

  -- Dispatch claim: once per tenant and message, tenant-keyed ---------------
  INSERT INTO public.processed_webhook_messages (provider, tenant_id, external_message_id, completed_at)
  VALUES ('green_api_dispatch', v_tenant, 'QA-ROLLBACK-1', now());
  BEGIN
    INSERT INTO public.processed_webhook_messages (provider, tenant_id, external_message_id, completed_at)
    VALUES ('green_api_dispatch', v_tenant, 'QA-ROLLBACK-1', now());
    RAISE EXCEPTION 'dispatch: a second connection must hit unique_violation';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  INSERT INTO public.processed_webhook_messages (provider, tenant_id, external_message_id, completed_at)
  VALUES ('green_api_dispatch', v_other_tenant, 'QA-ROLLBACK-1', now());

  -- trigger-automation's finished run row (with or without a primary key) --
  INSERT INTO public.automation_executions
    (execution_id, tenant_id, trigger_type, entity_id, depth, started_at, finished_at,
     status, actions_count, error)
  VALUES
    ('qa-run-fresh', v_tenant, 'whatsapp_message_received', 'qa-group', 0,
     now() - interval '1 second', now(), 'completed', 1, NULL),
    ('qa-run-old', v_tenant, 'whatsapp_message_received', 'qa-group', 0,
     now() - interval '31 days', now() - interval '31 days', 'failed', 1, 'boom');

  INSERT INTO public.processed_webhook_messages (provider, tenant_id, external_message_id, processed_at)
  VALUES ('green_api', v_tenant, 'qa-line:QA-ROLLBACK-OLD', now() - interval '15 days');

  -- Retention: run the scheduled statements -------------------------------
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'retention: pg_cron not installed, scheduled jobs not checked';
    RETURN;
  END IF;

  SELECT command INTO v_command FROM cron.job
  WHERE jobname = 'cleanup-processed-webhook-messages' AND schedule = '17 3 * * *';
  IF v_command IS NULL THEN
    RAISE EXCEPTION 'retention: cleanup-processed-webhook-messages must run daily at 03:17';
  END IF;
  EXECUTE v_command;

  SELECT command INTO v_command FROM cron.job
  WHERE jobname = 'cleanup-automation-executions' AND schedule = '27 3 * * *';
  IF v_command IS NULL THEN
    RAISE EXCEPTION 'retention: cleanup-automation-executions must run daily at 03:27';
  END IF;
  EXECUTE v_command;

  IF EXISTS (
    SELECT 1 FROM public.processed_webhook_messages
    WHERE tenant_id = v_tenant AND external_message_id = 'qa-line:QA-ROLLBACK-OLD'
  ) OR (
    SELECT count(*) FROM public.processed_webhook_messages
    WHERE tenant_id IN (v_tenant, v_other_tenant)
  ) <> 3 THEN
    RAISE EXCEPTION 'retention: only claims older than 14 days are deleted';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.automation_executions
    WHERE tenant_id = v_tenant AND execution_id = 'qa-run-old'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.automation_executions
    WHERE tenant_id = v_tenant AND execution_id = 'qa-run-fresh'
  ) THEN
    RAISE EXCEPTION 'retention: only runs older than 30 days are deleted';
  END IF;

  IF (
    SELECT count(*) FROM cron.job
    WHERE jobname IN ('cleanup-processed-webhook-messages', 'cleanup-automation-executions')
  ) <> 2 THEN
    RAISE EXCEPTION 'retention: each job must be scheduled once';
  END IF;
END
$test$;
SELECT 'automation dispatch: claims, lease, run rows and retention passed' AS result;
ROLLBACK;
