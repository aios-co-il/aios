-- pg_cron run history: keep 7 days.
-- pg_cron writes one cron.job_run_details row per job run and never deletes
-- them. With several jobs every minute, Production held ~775k rows since June
-- (~956 MB), the largest table outside the system graph. Nothing in AIOS reads
-- runs older than a week; the system-jobs screens show recent runs only.

-- 1. One-time cleanup ----------------------------------------------------------
-- Keeps the last 7 days (~50k rows on Production), truncates and reinserts
-- them, so the disk is freed at once with no ~725k-row DELETE and VACUUM FULL.
-- One DO block is one transaction. pg_cron writes this table every minute, so
-- the lock wait is capped at 5 s: on timeout the cleanup is skipped whole
-- (nothing changes) and the release goes on; the nightly job below still
-- deletes the old rows, only without freeing the disk at once.
DO $cleanup$
DECLARE
  v_kept integer;
BEGIN
  IF to_regclass('cron.job_run_details') IS NULL THEN
    RAISE NOTICE 'cron run history cleanup: pg_cron not installed, skipped';
    RETURN;
  END IF;

  PERFORM set_config('lock_timeout', '5s', true);
  BEGIN
    LOCK TABLE cron.job_run_details IN ACCESS EXCLUSIVE MODE;

    CREATE TEMP TABLE run_history_keep AS
      SELECT * FROM cron.job_run_details
      WHERE start_time >= now() - interval '7 days';
    GET DIAGNOSTICS v_kept = ROW_COUNT;

    TRUNCATE cron.job_run_details;
    INSERT INTO cron.job_run_details SELECT * FROM run_history_keep;
    DROP TABLE run_history_keep;

    RAISE NOTICE 'cron run history cleanup: kept % rows', v_kept;
  EXCEPTION WHEN lock_not_available THEN
    RAISE NOTICE 'cron run history cleanup: table busy for 5 s, skipped; the nightly job deletes the old rows';
  END;
  PERFORM set_config('lock_timeout', '0', true);
END
$cleanup$;

-- 2. Nightly retention (re)scheduled, so a re-run keeps one job ----------------
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'cron run history retention: pg_cron not installed, skipped';
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'cleanup-cron-run-history';

  -- A run that started over 7 days ago and never ended is stale too.
  perform cron.schedule(
    'cleanup-cron-run-history',
    '57 3 * * *',
    $job$delete from cron.job_run_details
         where start_time < now() - interval '7 days'$job$
  );
end
$$;
