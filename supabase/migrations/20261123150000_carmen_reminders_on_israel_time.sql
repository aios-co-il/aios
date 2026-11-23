-- Move Carmen's three live daily/weekly reminders onto cron schedules in
-- Israel time. Their legacy schedule ran 24h/7d after the previous run, so they
-- drifted from the requested time (Friday 16:00 arrived at 17:40). The time of
-- day and weekday come from scheduled_at, which Carmen stored in UTC correctly;
-- the stored cron_expression was UTC with an Asia/Jerusalem label.
-- Only the pinned ids change, and only while still on the legacy schedule.
-- No missed reminder is replayed: next_run is the next future slot.
with pinned as (
  select
    id,
    schedule_type as repeat,
    (scheduled_at at time zone 'Asia/Jerusalem') as local_at
  from public.agent_tasks
  where id in (
      '870fd441-cb65-48e4-a7d7-d307ceffb4e9', -- Family Link, daily 07:30
      'aff8c9c1-063d-403a-b543-25cf216fa3ff', -- Family Link, daily 07:30
      '0eab68cc-03bc-46b1-9e11-04b93856116b'  -- Saturday campaigns, Friday 16:00
    )
    and tenant_id = '2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019'
    and schedule_type in ('daily', 'weekly')
    and enabled
    and scheduled_at is not null
),
slots as (
  select
    id,
    repeat,
    local_at,
    -- First candidate: today (daily) or this week's weekday (weekly), local time.
    (
      (now() at time zone 'Asia/Jerusalem')::date
      + case
          when repeat = 'weekly' then
            ((extract(dow from local_at)::int
              - extract(dow from (now() at time zone 'Asia/Jerusalem'))::int
              + 7) % 7)
          else 0
        end
      + local_at::time
    ) at time zone 'Asia/Jerusalem' as candidate
  from pinned
)
update public.agent_tasks t
set
  schedule_type = 'recurring',
  timezone = 'Asia/Jerusalem',
  cron_expression = concat_ws(
    ' ',
    extract(minute from s.local_at)::int,
    extract(hour from s.local_at)::int,
    '*',
    '*',
    case when s.repeat = 'weekly' then extract(dow from s.local_at)::int::text else '*' end
  ),
  next_run = case
    when s.candidate > now() then s.candidate
    when s.repeat = 'weekly' then s.candidate + interval '7 days'
    else s.candidate + interval '1 day'
  end
from slots s
where t.id = s.id;
