-- AIO-593: record a failed background summary on its recording, so the UI can
-- stop waiting and say so instead of polling until its timeout.
alter table public.zoom_recordings
  add column if not exists summary_failed_at timestamptz,
  add column if not exists summary_error text;

comment on column public.zoom_recordings.summary_failed_at is
  'When the last background summary of this recording failed (AIO-593).';
comment on column public.zoom_recordings.summary_error is
  'Error message of the last failed background summary (AIO-593).';
