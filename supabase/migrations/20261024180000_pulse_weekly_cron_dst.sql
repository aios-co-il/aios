-- The weekly pulse digest is claimed only on Sunday 07:20–07:40 Asia/Jerusalem
-- (claim_campaign_pulse_delivery). Its cron ran once at 04:30 UTC, which is 07:30
-- only in summer time; in winter time it lands at 06:30 and the digest is skipped.
-- Fire at 04:30 and 05:30 UTC: exactly one of them is 07:30 Jerusalem time all
-- year, and the claim (window + last_sent_at slot) drops the other run.
-- Environments without the job (Staging, preview branches) are left unchanged.
DO $pulse_dst$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id
  FROM cron.job
  WHERE jobname = 'campaign-pulse-sunday-0730';

  IF job_id IS NOT NULL THEN
    PERFORM cron.alter_job(job_id, schedule := '30 4,5 * * 0');
  END IF;
END;
$pulse_dst$;
