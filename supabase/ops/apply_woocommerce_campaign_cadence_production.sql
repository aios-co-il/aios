-- Move the working WooCommerce cron onto the live campaign cadence.
-- Production Vault has no project URL, so the authenticated command already
-- stored on woocommerce-hourly-sync is reused instead of rebuilding headers.
DO $woocommerce_campaign_cadence$
DECLARE
  existing_job bigint;
  old_cmd text;
  new_schedule constant text := '45 4,11 * * *';
BEGIN
  SELECT command INTO old_cmd
  FROM cron.job
  WHERE jobname IN ('sync-woocommerce-twice-daily', 'woocommerce-hourly-sync')
    AND coalesce(command, '') <> ''
  ORDER BY CASE jobname WHEN 'sync-woocommerce-twice-daily' THEN 0 ELSE 1 END, jobid
  LIMIT 1;

  IF coalesce(old_cmd, '') <> '' THEN
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
    PERFORM cron.schedule('sync-woocommerce-twice-daily', new_schedule, old_cmd);
  ELSE
    PERFORM cron.alter_job(
      job_id := existing_job,
      schedule := new_schedule,
      command := old_cmd,
      active := true
    );
  END IF;
  END IF;

  UPDATE public.social_media_wordpress_sites
  SET woo_sync_enabled = true
  WHERE is_active
    AND woocommerce_enabled
    AND woo_sync_enabled = false
    AND coalesce(woocommerce_consumer_key, '') <> ''
    AND coalesce(woocommerce_consumer_secret, '') <> '';
EXCEPTION
  WHEN undefined_table OR undefined_function THEN
    RAISE EXCEPTION 'pg_cron is unavailable; WooCommerce campaign cadence not updated';
END;
$woocommerce_campaign_cadence$;
