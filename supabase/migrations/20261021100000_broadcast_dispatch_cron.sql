-- Broadcast sending runs every minute: broadcast-dispatch picks up scheduled
-- broadcasts and sends a throttled batch.
--
-- Production already has this job (created by hand), and so does Staging, so
-- the job is created ONLY when no job with this name exists. Nothing in git
-- carries a URL or a key: the cron command reads both from Vault at run time
-- (secrets `project_url` = https://<ref>.supabase.co and `service_role_key`).
-- When cron/vault or either secret is missing, the migration skips with a
-- NOTICE instead of failing.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.secrets') IS NULL THEN
    RAISE NOTICE 'broadcast-dispatch cron: pg_cron or vault not installed, skipped';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'broadcast-dispatch-every-min') THEN
    RAISE NOTICE 'broadcast-dispatch cron: job already exists, left unchanged';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM vault.secrets
      WHERE name IN ('project_url', 'service_role_key')) < 2 THEN
    RAISE NOTICE 'broadcast-dispatch cron: vault secrets project_url / service_role_key missing, skipped';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'broadcast-dispatch-every-min',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/broadcast-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  );
END;
$$;
