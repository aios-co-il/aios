-- Ads sync cadence (20261125100000_ads_sync_five_times_a_day): runs the
-- migration file itself (\ir) against the three jobs at their old twice-a-day
-- schedules, plus the Google Ads operational check, and expects five runs a day
-- with each job's minute and command unchanged and the other job untouched.
-- Synthetic jobs inside one transaction that is rolled back. Skipped where
-- pg_cron is not installed.
BEGIN;

DO $setup$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'ads sync cadence test: pg_cron not installed, skipped';
    RETURN;
  END IF;

  PERFORM cron.schedule('sync-facebook-insights-twice-daily', '0 5,12 * * *', $$SELECT 'qa-rollback-meta'$$);
  PERFORM cron.schedule('cron-sync-facebook-ecommerce-daily', '5 5,12 * * *', $$SELECT 'qa-rollback-ecommerce'$$);
  PERFORM cron.schedule('sync-google-ads-twice-daily', '10 5,12 * * *', $$SELECT 'qa-rollback-google'$$);
  PERFORM cron.schedule('google-ads-operational-check-2h', '25 */2 * * *', $$SELECT 'qa-rollback-operational'$$);
END;
$setup$;

\ir ../migrations/20261125100000_ads_sync_five_times_a_day.sql

DO $test$
DECLARE
  expected record;
  actual record;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  FOR expected IN
    SELECT *
    FROM (VALUES
      ('sync-facebook-insights-twice-daily', '0 5,8,11,14,17 * * *', $$SELECT 'qa-rollback-meta'$$),
      ('cron-sync-facebook-ecommerce-daily', '5 5,8,11,14,17 * * *', $$SELECT 'qa-rollback-ecommerce'$$),
      ('sync-google-ads-twice-daily', '10 5,8,11,14,17 * * *', $$SELECT 'qa-rollback-google'$$),
      ('google-ads-operational-check-2h', '25 */2 * * *', $$SELECT 'qa-rollback-operational'$$)
    ) AS jobs (jobname, schedule, command)
  LOOP
    SELECT schedule, command INTO actual
    FROM cron.job
    WHERE jobname = expected.jobname;

    IF actual.schedule IS DISTINCT FROM expected.schedule THEN
      RAISE EXCEPTION 'ads sync cadence: % runs at "%", expected "%"',
        expected.jobname, actual.schedule, expected.schedule;
    END IF;

    IF actual.command IS DISTINCT FROM expected.command THEN
      RAISE EXCEPTION 'ads sync cadence: % command changed to %',
        expected.jobname, actual.command;
    END IF;
  END LOOP;
END;
$test$;

ROLLBACK;
