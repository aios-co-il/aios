-- Meta "Data Deletion Request Callback" log.
-- Written only by the meta-data-deletion edge function (service role);
-- RLS is enabled with no policies so anon/authenticated roles have no access.

create table if not exists public.meta_data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  fb_user_id text,
  confirmation_code text not null unique,
  status text not null default 'received',
  payload jsonb,
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
  'Deletion requests received from Meta via the signed_request callback; status is shown on /data-deletion?code=.';
