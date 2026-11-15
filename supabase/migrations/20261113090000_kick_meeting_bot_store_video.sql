-- Let kick_internal_function queue meeting-bot-store-video (AIO-588), so the
-- video copy finalize and reconcile start runs in pg_net and outlives their
-- edge isolates. Same body as 20261030091000_nightly_reconciliation.sql with
-- one more allowlisted function.

-- Queues an allowlisted internal edge function in pg_net; service role only.
CREATE OR REPLACE FUNCTION public.kick_internal_function(p_function text, p_body jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  project_url text;
  worker_secret text;
  request_id bigint;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_function NOT IN (
    'cron-sync-google-ads',
    'cron-sync-facebook-insights',
    'cron-sync-facebook-ecommerce',
    'cron-sync-google-analytics',
    'carmen-reconcile-worker',
    'meeting-bot-store-video'
  ) THEN
    RAISE EXCEPTION 'invalid function';
  END IF;

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

  IF project_url IS NULL OR worker_secret IS NULL OR worker_secret = '' THEN
    RAISE EXCEPTION 'kick secrets missing';
  END IF;

  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 150000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kick_internal_function(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kick_internal_function(text, jsonb) TO service_role;
