-- A meeting name a person typed is kept: the name drawn from the summary
-- (AIO-563) replaces only names that came from the calendar, the bot or a file.
alter table public.zoom_recordings
  add column if not exists topic_set_manually boolean not null default false;

comment on column public.zoom_recordings.topic_set_manually is
  'True once a person renamed the recording; the summary never replaces meeting_topic then.';
