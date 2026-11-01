-- agent_tasks has no primary key in Production or Staging (the Production
-- baseline came without one), and 20261009000100_catchup_shipped_schema.sql
-- added it to the supabase_realtime publication. A table that publishes
-- updates needs a replica identity, so since then every UPDATE of agent_tasks
-- has failed with 55000 "cannot update table agent_tasks because it does not
-- have a replica identity and publishes updates": dispatch-agent-tasks could
-- not claim a due task, so no Carmen reminder or scheduled task has run.
--
-- The primary key on id gives the table its default replica identity. Every
-- row has a unique, non-null id (checked on Production before this change).
--
-- No replay: one-shot tasks that came due while updates failed are switched
-- off here instead of firing the moment the key exists; their result records
-- why. Nothing is sent by this migration. The window starts on 2026-10-09,
-- the date of the catch-up migration that added the table to the publication;
-- a task due before it was not stuck by this failure and is left as it is.
-- On Production this matches two rows (2026-10-23 and 2026-11-01), on
-- Staging none (read-only counts, 2026-11-01). The
-- update fires update_agent_tasks_updated_at, which sets updated_at.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_tasks'::regclass and contype = 'p'
  ) then
    alter table public.agent_tasks add primary key (id);
  end if;
end;
$$;

update public.agent_tasks
set
  enabled = false,
  result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
    'last_error',
    'missed: agent_tasks could not be updated when this task came due (20261101090000)'
  )
where status = 'pending'
  and schedule_type = 'once'
  and enabled
  and last_run is null
  and scheduled_at >= timestamptz '2026-10-09 00:00:00+00'
  and scheduled_at <= now();
