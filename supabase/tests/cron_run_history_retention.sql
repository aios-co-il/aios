-- pg_cron run history retention: 20261119220000_cron_run_history_retention.
-- Synthetic run rows inside one transaction that is rolled back; the retention
-- statement is read from cron.job. Skipped where pg_cron is not installed.
BEGIN;
DO $test$
DECLARE
  v_command text;
  v_job bigint := -424242;
BEGIN
  IF to_regclass('cron.job_run_details') IS NULL THEN
    RAISE NOTICE 'retention: pg_cron not installed, scheduled job not checked';
    RETURN;
  END IF;

  INSERT INTO cron.job_run_details (jobid, command, status, return_message, start_time, end_time)
  VALUES
    (v_job, 'qa-old', 'succeeded', 'QA ROLLBACK', now() - interval '8 days', now() - interval '8 days'),
    (v_job, 'qa-old-unfinished', 'running', 'QA ROLLBACK', now() - interval '9 days', NULL),
    (v_job, 'qa-recent', 'succeeded', 'QA ROLLBACK', now() - interval '6 days', now() - interval '6 days');

  SELECT command INTO v_command FROM cron.job
  WHERE jobname = 'cleanup-cron-run-history' AND schedule = '57 3 * * *';
  IF v_command IS NULL THEN
    RAISE EXCEPTION 'retention: cleanup-cron-run-history must run daily at 03:57';
  END IF;
  EXECUTE v_command;

  IF (SELECT array_agg(command ORDER BY command) FROM cron.job_run_details WHERE jobid = v_job)
     IS DISTINCT FROM ARRAY['qa-recent'] THEN
    RAISE EXCEPTION 'retention: only runs started over 7 days ago may go, got %',
      (SELECT array_agg(command ORDER BY command) FROM cron.job_run_details WHERE jobid = v_job);
  END IF;
END
$test$;
ROLLBACK;
