-- Schedule Carmen's manager round and nightly reconcile check where their
-- first migrations skipped them (AIO-311).
--
-- 20261101100000_carmen_manager_round.sql and
-- 20261030091000_nightly_reconciliation.sql create their cron jobs only when
-- Vault holds both `project_url` and `service_role_key`, and skip with a
-- NOTICE otherwise. Staging had neither secret and Production lacked
-- `project_url`, so on Staging both jobs were skipped and on Production they
-- would be. The secrets were added on 2026-11-03; this repeats the same two
-- blocks, so a job that already exists is left as it is and a still-missing
-- secret still skips with a NOTICE. The schedules and commands are copied
-- from those migrations unchanged.
--
-- Nothing is sent: the manager round starts in observe mode for every tenant
-- (no stored mode), and the reconcile worker only writes reports.

-- Manager round, every 15 minutes (07/22/37/52).
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.secrets') IS NULL THEN
    RAISE NOTICE 'carmen-manager-round cron: pg_cron or vault not installed, skipped';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'carmen-manager-round-15m') THEN
    RAISE NOTICE 'carmen-manager-round cron: job already exists, left unchanged';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM vault.secrets
      WHERE name IN ('project_url', 'service_role_key')) < 2 THEN
    RAISE NOTICE 'carmen-manager-round cron: vault secrets project_url / service_role_key missing, skipped';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'carmen-manager-round-15m',
    '7,22,37,52 * * * *',
    $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/carmen-manager-round',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 150000
      );
    $cron$
  );
END;
$$;

-- Reconcile check, nightly at 01:30 UTC.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.secrets') IS NULL THEN
    RAISE NOTICE 'carmen-reconcile cron: pg_cron or vault not installed, skipped';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'carmen-reconcile-nightly') THEN
    RAISE NOTICE 'carmen-reconcile cron: job already exists, left unchanged';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM vault.secrets
      WHERE name IN ('project_url', 'service_role_key')) < 2 THEN
    RAISE NOTICE 'carmen-reconcile cron: vault secrets project_url / service_role_key missing, skipped';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'carmen-reconcile-nightly',
    '30 1 * * *',
    $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/carmen-reconcile-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 150000
      );
    $cron$
  );
END;
$$;
