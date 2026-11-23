-- notify_task_notification_worker read Production's URL from its own code, so
-- every database built from the migrations (SQL tests, Preview branches,
-- Staging) posted to Production's task-notification-worker without a key: about
-- 700 401s a day. It now takes the project URL and key from this database's
-- vault and queues nothing when either is missing (AIO-226).

-- Clears the notification markers a change re-arms, then queues
-- task-notification-worker for this database's own project.
CREATE OR REPLACE FUNCTION public.notify_task_notification_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  project_url text;
  worker_key text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.campaigner_id IS DISTINCT FROM NEW.campaigner_id
       OR OLD.sales_person_id IS DISTINCT FROM NEW.sales_person_id THEN
      NEW.assignment_notification_sent_at := NULL;
      IF NEW.status <> 'done' THEN
        NEW.high_priority_reminder_sent_at := NULL;
        NEW.high_priority_creator_notified_at := NULL;
      END IF;
    END IF;

    IF OLD.due_date IS DISTINCT FROM NEW.due_date AND NEW.status <> 'done' THEN
      IF NEW.due_date IS NOT NULL
         AND (OLD.due_date IS NULL OR NEW.due_date > OLD.due_date) THEN
        NEW.overdue_notified_at := NULL;
        NEW.overdue_creator_notified_at := NULL;
      END IF;
    END IF;

    IF OLD.self_reminder_at IS DISTINCT FROM NEW.self_reminder_at THEN
      NEW.self_reminder_sent_at := NULL;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'done' THEN
      NEW.completion_creator_notified_at := NULL;
    END IF;
  END IF;

  -- An UPDATE queues the worker only for a change it notifies about.
  IF TG_OP = 'UPDATE' AND NOT (
    OLD.campaigner_id IS DISTINCT FROM NEW.campaigner_id
    OR OLD.sales_person_id IS DISTINCT FROM NEW.sales_person_id
    OR OLD.self_reminder_at IS DISTINCT FROM NEW.self_reminder_at
    OR OLD.due_date IS DISTINCT FROM NEW.due_date
    OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'done')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name IN ('SUPABASE_URL', 'supabase_url', 'project_url')
  ORDER BY CASE name WHEN 'SUPABASE_URL' THEN 0 WHEN 'supabase_url' THEN 1 ELSE 2 END
  LIMIT 1;

  SELECT decrypted_secret INTO worker_key
  FROM vault.decrypted_secrets
  WHERE name = 'task_worker_anon_key';

  IF coalesce(project_url, '') = '' OR coalesce(worker_key, '') = '' THEN
    RAISE NOTICE 'notify_task_notification_worker: vault has no project URL or worker key; task % not queued', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/task-notification-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_key
    ),
    body := jsonb_build_object('task_id', NEW.id),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_task_notification_worker failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_task_notification_worker() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.notify_task_notification_worker() TO service_role;
