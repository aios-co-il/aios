-- Flow delay steps that really wait (AIO-611).
--
-- trigger-automation skipped every delay longer than 30 seconds and ran the next
-- steps at once. A longer delay now stores the paused run here; the
-- automation-delay-worker function resumes it when resume_at arrives.
--
-- 1. automation_delayed_runs: one row per paused run. Only service_role reads
--    or writes it: the payload is the lead data the run started with.
-- 2. Cron `automation-delay-worker-every-min` calls the worker only when a wait
--    is due or a claim went stale, with the URL and key read from Vault (as broadcast-dispatch does).
-- 3. Cron `cleanup-automation-delayed-runs` deletes finished rows after 30 days.
--    Waiting rows stay until they resume, however long the delay.
--
-- Nothing is sent on deploy: the table starts empty and no flow has a delay
-- step in Production.

-- 1. Paused runs ---------------------------------------------------------------
create table public.automation_delayed_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  -- No foreign key: the flow editor deletes and re-inserts a flow's steps, with
  -- the same ids, on every save. The worker cancels a wait whose step is gone.
  delay_step_id uuid not null,
  entity_id text,
  trigger_type text,
  payload jsonb not null,
  status_guard jsonb,
  resume_at timestamptz not null,
  status text not null default 'waiting'
    check (status in ('waiting', 'resuming', 'resumed', 'cancelled', 'failed')),
  outcome text,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open wait per org, automation, delay step and entity: a new wait restarts
-- the open row, so a lead that re-enters a status restarts its timer.
create unique index automation_delayed_runs_one_waiting_idx
  on public.automation_delayed_runs (tenant_id, automation_id, delay_step_id, entity_id)
  where status = 'waiting';

create index automation_delayed_runs_due_idx
  on public.automation_delayed_runs (resume_at)
  where status = 'waiting';

create index automation_delayed_runs_automation_idx
  on public.automation_delayed_runs (automation_id);

alter table public.automation_delayed_runs enable row level security;

revoke all on public.automation_delayed_runs from anon, authenticated;
grant all on public.automation_delayed_runs to service_role;

-- automation_delayed_runs has no policy on purpose: only service_role reads or writes a paused run.

-- 2 + 3. Crons: (re)schedules both jobs, so a re-run keeps one of each ----------
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'automation delay crons: pg_cron not installed, skipped';
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('automation-delay-worker-every-min', 'cleanup-automation-delayed-runs');

  perform cron.schedule(
    'cleanup-automation-delayed-runs',
    '37 3 * * *',
    $job$delete from public.automation_delayed_runs
         where status <> 'waiting'
           and coalesce(finished_at, claimed_at, created_at) < now() - interval '30 days'$job$
  );

  if to_regclass('vault.secrets') is null
     or (select count(*) from vault.secrets
         where name in ('project_url', 'service_role_key')) < 2 then
    raise notice 'automation-delay-worker cron: vault secrets project_url / service_role_key missing, skipped';
    return;
  end if;

  perform cron.schedule(
    'automation-delay-worker-every-min',
    '* * * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/automation-delay-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      )
      where exists (
        select 1 from public.automation_delayed_runs
        where (status = 'waiting' and resume_at <= now())
           -- A claim a dead worker left: the worker marks it failed (STALE_CLAIM_MS).
           or (status = 'resuming' and claimed_at < now() - interval '15 minutes')
      );
    $cron$
  );
end
$$;
