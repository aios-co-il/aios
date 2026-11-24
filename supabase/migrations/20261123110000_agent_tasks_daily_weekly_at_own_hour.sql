-- Carmen's daily and weekly tasks run at their own hour.
--
-- dispatch-agent-tasks ran a 'daily' or 'weekly' task whenever a day (a week)
-- had passed since its last run, so it fired at the hour it was created and
-- slid a few minutes later on every run: a Friday 16:00 reminder created at
-- 17:25 went out at 17:40 two weeks later. New tasks are now stored as
-- schedule_type 'recurring' with a cron in Israel time
-- (run-ai-agent/executors/recurring-schedule.ts), and the dispatcher no
-- longer reads 'daily' or 'weekly'.
--
-- This moves the tasks that still run on the old rule to the same shape. The
-- hour (and a weekly task's weekday) is the Israel time of scheduled_at, the
-- instant Carmen saved correctly; a task without one keeps the hour it has
-- been running at. The stored cron_expression is replaced because Carmen
-- wrote it in UTC ("0 14 * * 5" for Friday 16:00).
--
-- next_run is the first slot after now, so nothing runs when this is applied
-- and no missed run is replayed. Disabled and failed rows were not being
-- dispatched and are left as they are. The update fires only
-- update_agent_tasks_updated_at.

with legacy as (
  select
    id,
    schedule_type as cadence,
    coalesce(scheduled_at, last_run, created_at)
      at time zone 'Asia/Jerusalem' as wall,
    (now() at time zone 'Asia/Jerusalem')::date as today
  from public.agent_tasks
  where schedule_type in ('daily', 'weekly')
    and enabled
    and status in ('pending', 'completed')
),

slot as (
  select
    id,
    cadence,
    today,
    extract(minute from wall)::int as slot_minute,
    extract(hour from wall)::int as slot_hour,
    extract(dow from wall)::int as slot_weekday
  from legacy
),

first_slot as (
  select
    id,
    cadence,
    slot_minute,
    slot_hour,
    slot_weekday,
    -- Today for a daily task, the coming slot_weekday for a weekly one.
    (
      today + case
        when cadence = 'weekly'
          then (slot_weekday - extract(dow from today)::int + 7) % 7
        else 0
      end
    ) + make_time(slot_hour, slot_minute, 0) as local_first,
    case
      when cadence = 'weekly' then interval '7 days'
      else interval '1 day'
    end as period
  from slot
)

update public.agent_tasks as task
set
  schedule_type = 'recurring',
  cron_expression = format(
    '%s %s * * %s',
    first_slot.slot_minute,
    first_slot.slot_hour,
    case
      when first_slot.cadence = 'weekly' then first_slot.slot_weekday::text
      else '*'
    end
  ),
  timezone = 'Asia/Jerusalem',
  next_run = case
    when first_slot.local_first at time zone 'Asia/Jerusalem' > now()
      then first_slot.local_first at time zone 'Asia/Jerusalem'
    else
      (first_slot.local_first + first_slot.period)
        at time zone 'Asia/Jerusalem'
  end
from first_slot
where task.id = first_slot.id;
