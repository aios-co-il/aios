-- Bounds meeting-bot-store-video retries (AIO-588). Reconcile counts each copy it
-- re-queues in video_store_attempts and stops at the cap; the store function
-- records why a copy failed and sets video_store_failed_at when retrying cannot
-- help (Storage answered 413 because the video exceeds the upload limit).
alter table public.meeting_bot_sessions
  add column if not exists video_store_attempts integer not null default 0,
  add column if not exists video_store_error text,
  add column if not exists video_store_failed_at timestamptz;

comment on column public.meeting_bot_sessions.video_store_attempts is
  'Video copies meeting-bot-reconcile re-queued for this session; it stops at a cap.';
comment on column public.meeting_bot_sessions.video_store_error is
  'Why the last meeting-bot-store-video copy failed, or null.';
comment on column public.meeting_bot_sessions.video_store_failed_at is
  'When the video copy failed permanently; reconcile no longer retries it.';
