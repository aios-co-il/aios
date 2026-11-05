-- Carmen's tasks start from now: nothing from the past runs (AIO-308).
--
-- Every UPDATE of agent_tasks failed from 2026-10-09 until the primary key in
-- 20261101102500, so no task could be claimed. Once updates work again, two
-- kinds of old task would fire:
--
-- 1. Dangerous-lane subtasks (status 'queued') and runs stuck as 'running'.
--    When a dangerous task finishes, _shared/subagent.ts promotes the oldest
--    'queued' one of that tenant and runs it, whatever its age or enabled
--    flag. On Production 73 'queued' rows (2026-06-25 to 2026-07-24, two
--    tenants) and 9 'running' rows (2026-06-25 to 2026-07-21) match; Staging
--    has none (read-only counts, 2026-11-03). All are older than the window
--    of 20261101102500, so they are closed here as failed and switched off.
--
-- 2. Daily and weekly tasks whose last run is more than a day (a week) old:
--    dispatch-agent-tasks runs them at once, at whatever hour the deploy
--    lands. Their last_run moves to now, so the next run comes one period
--    after the deploy. Production and Staging have none today; the statement
--    covers rows that appear before the deploy.
--
-- Nothing is sent by this migration. The update fires only
-- update_agent_tasks_updated_at.

update public.agent_tasks
set
  status = 'failed',
  enabled = false,
  result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
    'last_error',
    'stale: closed so it never runs late (20261103091000)'
  )
where status in ('queued', 'running')
  and created_at < timestamptz '2026-10-09 00:00:00+00';

update public.agent_tasks
set last_run = now()
where enabled
  and status in ('pending', 'completed')
  and (
    (schedule_type = 'daily'
      and (last_run is null or last_run <= now() - interval '1 day'))
    or (schedule_type = 'weekly'
      and (last_run is null or last_run <= now() - interval '7 days'))
  );
