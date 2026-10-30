-- Weekly pulse cron vs its delivery claim (20261026091000_pulse_weekly_cron_dst).
-- claim_campaign_pulse_delivery reads now(), so it cannot be called for a chosen
-- date; instead this replays the live cron.job schedule against the claim's
-- window (Sunday 07:20 to before 07:40 Asia/Jerusalem) on a winter and a summer
-- Sunday and expects exactly one run inside it. Read-only, rolled back anyway.
BEGIN;
DO $test$
DECLARE
  v_schedule text;
  v_minute int;
  v_hours int[];
  v_sunday date;
  v_in_window int;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pulse weekly cron test: pg_cron not installed, skipped';
    RETURN;
  END IF;

  SELECT schedule INTO v_schedule
  FROM cron.job
  WHERE jobname = 'campaign-pulse-sunday-0730';

  IF v_schedule IS NULL THEN
    RAISE NOTICE 'pulse weekly cron test: job not found, skipped';
    RETURN;
  END IF;

  v_minute := split_part(v_schedule, ' ', 1)::int;
  v_hours := string_to_array(split_part(v_schedule, ' ', 2), ',')::int[];

  -- 2026-10-25 is the first winter-time Sunday (UTC+2); 2026-06-28 is summer time (UTC+3).
  FOREACH v_sunday IN ARRAY ARRAY[date '2026-10-25', date '2026-06-28'] LOOP
    SELECT count(*) INTO v_in_window
    FROM unnest(v_hours) AS h,
      LATERAL (
        SELECT timezone('Asia/Jerusalem', (v_sunday + make_time(h, v_minute, 0)) AT TIME ZONE 'UTC') AS at
      ) local_run
    WHERE EXTRACT(ISODOW FROM local_run.at) = 7
      AND local_run.at::time >= time '07:20'
      AND local_run.at::time < time '07:40';

    IF v_in_window <> 1 THEN
      RAISE EXCEPTION 'schedule "%": % runs inside the claim window on %, expected 1',
        v_schedule, v_in_window, v_sunday;
    END IF;
  END LOOP;
END;
$test$;
ROLLBACK;
