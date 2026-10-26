-- AIO-226: no task WhatsApp on Shabbat (Saturday, Asia/Jerusalem).
--
-- Peer task notifications (collaborator added, update added) come straight
-- from the app to trigger-automation. During the quiet window (Saturday 00:00
-- to Sunday 08:30 Israel time) they are parked here, and task-notification-
-- worker sends each one once at the end of the window. A hold left unreleased
-- for 24h after hold_until expires unsent, so nothing old is ever replayed.
-- Worker-driven notifications need no row: their task markers stay NULL.
--
-- The table starts empty, so this migration sends nothing by itself.

CREATE TABLE IF NOT EXISTS public.task_notification_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  hold_key text NOT NULL DEFAULT '',
  request_body jsonb NOT NULL,
  hold_reason text NOT NULL DEFAULT 'shabbat',
  hold_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  release_result jsonb,
  CONSTRAINT task_notification_holds_type_check CHECK (
    notification_type IN ('task_collaborator_added', 'task_update_added')
  ),
  CONSTRAINT task_notification_holds_reason_check CHECK (
    hold_reason IN ('shabbat')
  )
);

COMMENT ON TABLE public.task_notification_holds IS
  'AIO-226: peer task WhatsApp notifications held over Shabbat; released once by task-notification-worker at Sunday 08:30 Israel time, expired unsent after 24h. Service role only.';

-- One open hold per notification: a repeated call while held is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS task_notification_holds_open_key
  ON public.task_notification_holds (task_id, notification_type, hold_key)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS task_notification_holds_due
  ON public.task_notification_holds (hold_until)
  WHERE released_at IS NULL;

ALTER TABLE public.task_notification_holds ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role (edge functions) reads or writes it.
REVOKE ALL ON TABLE public.task_notification_holds FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.task_notification_holds TO service_role;
