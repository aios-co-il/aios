-- Keep WooCommerce data fresh before the twice-daily report refreshes.
-- This replaces the legacy one-off hourly job with a durable Vault-backed job.
DO $woocommerce_report_sync$
DECLARE
  project_url text;
  worker_secret text;
  existing_job bigint;
  cmd text;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name IN ('SUPABASE_URL', 'supabase_url', 'project_url')
  ORDER BY CASE name WHEN 'SUPABASE_URL' THEN 0 WHEN 'supabase_url' THEN 1 ELSE 2 END
  LIMIT 1;

  SELECT decrypted_secret INTO worker_secret
  FROM vault.decrypted_secrets
  WHERE name IN ('service_role_key', 'SUPABASE_SERVICE_ROLE_KEY')
  ORDER BY CASE name WHEN 'service_role_key' THEN 0 ELSE 1 END
  LIMIT 1;

  IF coalesce(project_url, '') = '' OR coalesce(worker_secret, '') = '' THEN
    RAISE NOTICE 'WooCommerce report sync not updated: required Vault secrets are missing';
    RETURN;
  END IF;

  cmd := format(
    $cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name IN ('service_role_key', 'SUPABASE_SERVICE_ROLE_KEY')
          ORDER BY CASE name WHEN 'service_role_key' THEN 0 ELSE 1 END
          LIMIT 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
    $cron$,
    rtrim(project_url, '/') || '/functions/v1/cron-sync-woocommerce'
  );

  -- Remove the historical, manually-installed job so it cannot duplicate work.
  FOR existing_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'woocommerce-hourly-sync'
  LOOP
    PERFORM cron.unschedule(existing_job);
  END LOOP;

  SELECT jobid INTO existing_job
  FROM cron.job
  WHERE jobname = 'sync-woocommerce-twice-daily'
  LIMIT 1;

  IF existing_job IS NULL THEN
    PERFORM cron.schedule(
      'sync-woocommerce-twice-daily',
      '30 2,11 * * *',
      cmd
    );
  ELSE
    PERFORM cron.alter_job(
      job_id := existing_job,
      schedule := '30 2,11 * * *',
      command := cmd,
      active := true
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function THEN
    RAISE NOTICE 'pg_cron, pg_net, or Vault is unavailable; WooCommerce report sync not updated';
END;
$woocommerce_report_sync$;
