-- Database calls to edge functions use this database's Vault `project_url`
-- (20261123130000_functions_url_from_vault, AIO-192): carmen_send_activation and
-- claude_notify_david post to their own project, stop when the secret is
-- missing, and no cron job or public function names Production's address.
-- Synthetic rows; rolls back.
BEGIN;
CREATE TEMP TABLE functions_url_results (test text, passed boolean) ON COMMIT DROP;

DO $test$
DECLARE
  tenant uuid;
  queued_before bigint;
  result jsonb;
  message text;
  request record;
BEGIN
  INSERT INTO public.tenants (name, slug)
    VALUES ('QA ROLLBACK functions url', 'qa-functions-url-' || gen_random_uuid())
    RETURNING id INTO tenant;

  -- Without the secret (CI, a fresh Preview branch) nothing is queued anywhere.
  DELETE FROM vault.secrets WHERE name = 'project_url';
  SELECT count(*) INTO queued_before FROM net.http_request_queue;

  result := public.carmen_send_activation(tenant, NULL, '0501234567');
  INSERT INTO functions_url_results VALUES
    ('activation without project_url: refused', result ->> 'error' = 'project_url_missing'),
    ('activation without project_url: no pending row',
      NOT EXISTS (SELECT 1 FROM public.wa_pending_activations WHERE tenant_id = tenant));

  BEGIN
    PERFORM public.claude_notify_david('QA ROLLBACK', tenant);
    message := 'queued';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
  END;
  INSERT INTO functions_url_results VALUES
    ('notify without project_url: raises', message LIKE '%project_url is missing%');

  INSERT INTO functions_url_results
    SELECT 'without project_url: nothing queued', count(*) = queued_before
    FROM net.http_request_queue;

  -- With this project's secret, each call goes to its own functions URL.
  PERFORM vault.create_secret('https://qa-project.example.test/', 'project_url');

  result := public.carmen_send_activation(tenant, NULL, '0501234567');
  SELECT url INTO request FROM net.http_request_queue ORDER BY id DESC LIMIT 1;
  INSERT INTO functions_url_results VALUES
    ('activation queued', (result ->> 'ok')::boolean),
    ('activation posts to own project',
      request.url = 'https://qa-project.example.test/functions/v1/carmen-activate-phone');

  result := public.claude_notify_david('QA ROLLBACK', tenant);
  SELECT url INTO request FROM net.http_request_queue ORDER BY id DESC LIMIT 1;
  INSERT INTO functions_url_results VALUES
    ('notify queued', (result ->> 'queued')::boolean),
    ('notify posts to own project',
      request.url = 'https://qa-project.example.test/functions/v1/claude-notify');
END;
$test$;

-- No database object built from the migrations names Production's address.
-- The three triggers that post to another, unknown project are AIO-66.
INSERT INTO functions_url_results
  SELECT 'no public function names Production', NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc LIKE '%zvoijyneresvkadpprel%'
  );

INSERT INTO functions_url_results
  SELECT 'no cron job names a supabase.co URL',
    to_regclass('cron.job') IS NULL
    OR NOT EXISTS (SELECT 1 FROM cron.job WHERE command ~ 'https://[a-z0-9]+\.supabase\.co');

DO $$ BEGIN IF EXISTS (SELECT 1 FROM functions_url_results WHERE NOT passed) THEN
  RAISE EXCEPTION 'functions URL regression failed: %',
    (SELECT jsonb_agg(to_jsonb(r)) FROM functions_url_results r WHERE NOT passed);
END IF; END $$;
SELECT * FROM functions_url_results;
ROLLBACK;
