-- Meta "Data Deletion Request Callback" log.
-- Written only by the meta-data-deletion edge function (service role);
-- RLS is enabled with no policies so anon/authenticated roles have no access.
-- Only the fields needed to track the request are kept (no raw payload):
-- the Facebook user id, Meta's issued_at and our status.

create table if not exists public.meta_data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  fb_user_id text,
  confirmation_code text not null unique,
  status text not null default 'received',
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

-- Status values are mirrored in src/components/DataDeletionPage/dataDeletionStatus.ts (page labels).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'meta_data_deletion_requests_status_check'
      and conrelid = 'public.meta_data_deletion_requests'::regclass
  ) then
    alter table public.meta_data_deletion_requests
      add constraint meta_data_deletion_requests_status_check
      check (status in ('received', 'in_progress', 'completed', 'rejected'));
  end if;
end
$$;

alter table public.meta_data_deletion_requests enable row level security;

comment on table public.meta_data_deletion_requests is
  'Deletion requests received from Meta via the signed_request callback; status is shown on /data-deletion?code=. Rows are removed after 12 months (see cron job meta-data-deletion-requests-retention).';

-- Retention: /privacy promises technical logs are kept at most 12 months.
-- Pure SQL job, so no Vault secrets are needed. Skips when pg_cron is not
-- installed and leaves an existing job unchanged (same pattern as
-- 20261021100000_broadcast_dispatch_cron.sql).
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'meta-data-deletion retention cron: pg_cron not installed, skipped';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'meta-data-deletion-requests-retention') then
    raise notice 'meta-data-deletion retention cron: job already exists, left unchanged';
    return;
  end if;

  perform cron.schedule(
    'meta-data-deletion-requests-retention',
    '30 3 * * *',
    $cron$
      delete from public.meta_data_deletion_requests
      where created_at < now() - interval '12 months'
    $cron$
  );
end
$$;
