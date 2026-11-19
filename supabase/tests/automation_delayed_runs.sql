-- Flow delay steps that really wait (AIO-611): 20261119090000_automation_delayed_runs.
-- Synthetic rows inside one transaction that is rolled back. The statements are
-- the ones trigger-automation's pause-run.ts and automation-delay-worker send
-- through PostgREST; the retention statement is read from cron.job when pg_cron
-- is installed.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_auto uuid;
  v_step uuid := gen_random_uuid();
  v_rows int;
  v_command text;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_tenant, 'QA ROLLBACK delayed runs', 'qa-dr-' || left(v_tenant::text, 8)),
    (v_other_tenant, 'QA ROLLBACK delayed runs 2', 'qa-dr-' || left(v_other_tenant::text, 8));
  INSERT INTO public.automations (name, tenant_id, trigger_type, action_type, configuration)
  VALUES ('QA ROLLBACK delay', v_tenant, 'lead_status_changed', 'webhook', '{}')
  RETURNING id INTO v_auto;

  -- Only service_role may touch a paused run ---------------------------------
  IF has_table_privilege('authenticated', 'public.automation_delayed_runs', 'SELECT')
     OR has_table_privilege('anon', 'public.automation_delayed_runs', 'SELECT') THEN
    RAISE EXCEPTION 'grants: anon and authenticated must not read paused runs';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.automation_delayed_runs'::regclass) THEN
    RAISE EXCEPTION 'rls: automation_delayed_runs must have row level security on';
  END IF;

  -- One open wait per org, automation, step and entity -----------------------
  INSERT INTO public.automation_delayed_runs
    (tenant_id, automation_id, delay_step_id, entity_id, payload, resume_at)
  VALUES (v_tenant, v_auto, v_step, 'lead-1', '{}', now() - interval '1 minute');
  BEGIN
    INSERT INTO public.automation_delayed_runs
      (tenant_id, automation_id, delay_step_id, entity_id, payload, resume_at)
    VALUES (v_tenant, v_auto, v_step, 'lead-1', '{}', now() + interval '7 days');
    RAISE EXCEPTION 'one waiting: a second open wait for the same lead must hit unique_violation';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  -- Another lead, and the same lead in another org, wait independently.
  INSERT INTO public.automation_delayed_runs
    (tenant_id, automation_id, delay_step_id, entity_id, payload, resume_at)
  VALUES
    (v_tenant, v_auto, v_step, 'lead-2', '{}', now() + interval '7 days'),
    (v_other_tenant, v_auto, v_step, 'lead-1', '{}', now() + interval '7 days');

  -- Restart: a new wait for the same lead updates the open row in place -----
  UPDATE public.automation_delayed_runs
  SET resume_at = now() - interval '1 minute', payload = '{"restarted": true}'
  WHERE tenant_id = v_tenant AND automation_id = v_auto AND delay_step_id = v_step
    AND entity_id = 'lead-1' AND status = 'waiting';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'restart: exactly the lead''s open wait must be restarted, got %', v_rows;
  END IF;

  -- Claim: due waits only, and only once -------------------------------------
  UPDATE public.automation_delayed_runs
  SET status = 'resuming', claimed_at = now()
  WHERE status = 'waiting' AND resume_at <= now() AND tenant_id IN (v_tenant, v_other_tenant);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'claim: exactly the one due wait must be claimed, got %', v_rows;
  END IF;
  UPDATE public.automation_delayed_runs
  SET status = 'resuming', claimed_at = now()
  WHERE status = 'waiting' AND resume_at <= now() AND tenant_id IN (v_tenant, v_other_tenant);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'claim: a second worker must claim nothing, got %', v_rows;
  END IF;

  BEGIN
    UPDATE public.automation_delayed_runs SET status = 'done' WHERE tenant_id = v_tenant;
    RAISE EXCEPTION 'status: an unknown status must be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Retention: finished rows after 30 days, waiting rows never ---------------
  UPDATE public.automation_delayed_runs
  SET status = 'resumed', finished_at = now() - interval '31 days'
  WHERE tenant_id = v_tenant AND status = 'resuming';
  UPDATE public.automation_delayed_runs
  SET created_at = now() - interval '200 days'
  WHERE tenant_id = v_tenant AND entity_id = 'lead-2';

  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'retention: pg_cron not installed, scheduled job not checked';
    RETURN;
  END IF;
  SELECT command INTO v_command FROM cron.job
  WHERE jobname = 'cleanup-automation-delayed-runs' AND schedule = '37 3 * * *';
  IF v_command IS NULL THEN
    RAISE EXCEPTION 'retention: cleanup-automation-delayed-runs must run daily at 03:37';
  END IF;
  EXECUTE v_command;

  IF EXISTS (
    SELECT 1 FROM public.automation_delayed_runs
    WHERE tenant_id = v_tenant AND status = 'resumed'
  ) THEN
    RAISE EXCEPTION 'retention: a run finished 31 days ago must be deleted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.automation_delayed_runs
    WHERE tenant_id = v_tenant AND entity_id = 'lead-2' AND status = 'waiting'
  ) THEN
    RAISE EXCEPTION 'retention: a waiting run must stay, however old';
  END IF;
END
$test$;
ROLLBACK;
