-- Staging only: run broadcast-dispatch every minute (Production already has
-- 'broadcast-dispatch-every-min'). Points at the Staging project only and
-- uses Staging's own vault service_role_key.
--
-- Safe to install: Staging edge functions run behind the outbound guard, so
-- WhatsApp goes only to STAGING_ALLOWED_PHONE_NUMBERS and email only to
-- STAGING_ALLOWED_EMAILS; everything else is blocked and marked failed.
-- Before installing, confirm no old broadcasts are queued:
--   SELECT status, count(*) FROM public.broadcasts
--   WHERE status IN ('scheduled', 'sending') GROUP BY 1;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'broadcast-dispatch-every-min';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'broadcast-dispatch-every-min',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://mzjsuvatrzhciojmbbbm.supabase.co/functions/v1/broadcast-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'service_role_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  );
END;
$$;
