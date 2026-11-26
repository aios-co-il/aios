-- The scheduled ads syncs run five times a day instead of twice: every 3 hours
-- from 05:00 to 17:00 UTC (07:00, 10:00, 13:00, 16:00, 19:00 in Israel winter
-- time; one hour later in summer). Each job keeps its minute (Meta insights :00,
-- Meta ecommerce :05, Google Ads :10) so the three chains do not start together.
-- ADS_SYNC_SCHEDULES in supabase/functions/_shared/ads-sync/schedules.ts is the
-- source of truth; its test checks these schedules match it.
--
-- Only the schedule changes: commands, keys and bodies stay as they are, so this
-- migration carries no key. The job names keep "twice-daily": pg_cron cannot
-- rename a job, and recreating one would need its command, which holds a key.
-- Environments without a job (Staging, Preview branches) skip it with a NOTICE.
DO $ads_sync_cadence$
DECLARE
  target record;
  job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'ads sync cadence: pg_cron not installed, skipped';
    RETURN;
  END IF;

  FOR target IN
    SELECT *
    FROM (VALUES
      ('sync-facebook-insights-twice-daily', '0 5,8,11,14,17 * * *'),
      ('cron-sync-facebook-ecommerce-daily', '5 5,8,11,14,17 * * *'),
      ('sync-google-ads-twice-daily', '10 5,8,11,14,17 * * *')
    ) AS jobs (jobname, schedule)
  LOOP
    SELECT jobid INTO job_id
    FROM cron.job
    WHERE jobname = target.jobname;

    IF job_id IS NULL THEN
      RAISE NOTICE 'ads sync cadence: % not found, left unchanged', target.jobname;
      CONTINUE;
    END IF;

    PERFORM cron.alter_job(job_id, schedule := target.schedule);
  END LOOP;
END;
$ads_sync_cadence$;
