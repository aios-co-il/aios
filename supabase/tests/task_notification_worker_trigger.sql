-- notify_task_notification_worker queues task-notification-worker only for this
-- database's own project, from its vault (AIO-226). Synthetic rows; rolls back.
BEGIN;
CREATE TEMP TABLE task_trigger_results (test text, passed boolean) ON COMMIT DROP;

DO $test$
DECLARE
  tenant uuid;
  agency uuid;
  task uuid;
  queued_before bigint;
  request record;
BEGIN
  INSERT INTO public.tenants (name, slug)
    VALUES ('QA ROLLBACK task trigger', 'qa-task-trigger-' || gen_random_uuid())
    RETURNING id INTO tenant;
  INSERT INTO public.agencies (name, tenant_id)
    VALUES ('QA ROLLBACK agency', tenant)
    RETURNING id INTO agency;

  -- Without vault secrets (CI, a fresh Preview branch) nothing is queued: the
  -- old trigger posted to Production's hardcoded URL without a key.
  DELETE FROM vault.secrets
    WHERE name IN ('SUPABASE_URL', 'supabase_url', 'project_url', 'task_worker_anon_key');
  SELECT count(*) INTO queued_before FROM net.http_request_queue;
  INSERT INTO public.tasks (title, agency_id, tenant_id)
    VALUES ('QA ROLLBACK task', agency, tenant)
    RETURNING id INTO task;
  INSERT INTO task_trigger_results
    SELECT 'no vault secrets: nothing queued', count(*) = queued_before
    FROM net.http_request_queue;

  -- With this project's secrets, the call goes to its own URL with its key.
  PERFORM vault.create_secret('https://qa-project.example.test/', 'project_url');
  PERFORM vault.create_secret('qa-worker-key', 'task_worker_anon_key');
  UPDATE public.tasks SET due_date = current_date + 1 WHERE id = task;
  SELECT url, headers, body INTO request
    FROM net.http_request_queue
    ORDER BY id DESC
    LIMIT 1;
  INSERT INTO task_trigger_results VALUES
    ('queued to own project URL',
      request.url = 'https://qa-project.example.test/functions/v1/task-notification-worker'),
    ('sends the vault key', request.headers ->> 'Authorization' = 'Bearer qa-worker-key'),
    ('body names the task', convert_from(request.body, 'UTF8')::jsonb ->> 'task_id' = task::text);

  -- A change the worker does not notify about queues nothing.
  SELECT count(*) INTO queued_before FROM net.http_request_queue;
  UPDATE public.tasks SET priority = 2 WHERE id = task;
  INSERT INTO task_trigger_results
    SELECT 'unrelated update: nothing queued', count(*) = queued_before
    FROM net.http_request_queue;
END;
$test$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM task_trigger_results WHERE NOT passed) THEN
  RAISE EXCEPTION 'Task trigger regression failed: %',
    (SELECT jsonb_agg(to_jsonb(r)) FROM task_trigger_results r WHERE NOT passed);
END IF; END $$;
SELECT * FROM task_trigger_results;
ROLLBACK;
