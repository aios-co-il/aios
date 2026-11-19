-- Google tokens out of the browser's reach, step 1 of 3 (AIO-608, security
-- finding B).
--
-- tenant_integrations keeps a Google connection's access token in api_key and
-- its refresh token in settings.refresh_token, and every member of the tenant
-- can read every column of the tenant's rows (tenant_members_view_integrations).
-- Any member could copy the refresh token of whoever connected Analytics,
-- Search Console or Ads and use it outside AIOS, also after leaving.
--
-- The tokens move to integration_secrets, which only the service role reads:
--   1. (this migration) create the table, copy every Google token written to
--      tenant_integrations into it, and backfill the existing ones. Nothing
--      reads the table yet, so nothing changes for users.
--   2. edge functions read the tokens from integration_secrets.
--   3. the trigger moves the tokens instead of copying them, and the copies
--      left in tenant_integrations are cleared.
--
-- No data changes in tenant_integrations.

-- One row per Google connection: the tokens that used to live on it.
create table if not exists public.integration_secrets (
  integration_id uuid primary key
    references public.tenant_integrations (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  access_token text,
  refresh_token text,
  updated_at timestamptz not null default now()
);

comment on table public.integration_secrets is
  'Google OAuth tokens of tenant_integrations rows. Service role only: no policies and no browser grants.';

-- Service role only: RLS on with no policy, and no grant to anon or authenticated.
alter table public.integration_secrets enable row level security;
revoke all on table public.integration_secrets from public, anon, authenticated;
grant all on table public.integration_secrets to service_role;

-- Copies a Google row's tokens into integration_secrets. Security definer:
-- members still edit their own Google rows from the browser (property and
-- site choices), and those edits must not need a grant on the secrets table.
create or replace function public.copy_google_integration_secrets()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.integration_secrets (integration_id, tenant_id, access_token, refresh_token, updated_at)
  values (new.id, new.tenant_id, new.api_key, new.settings ->> 'refresh_token', now())
  on conflict (integration_id) do update
    set tenant_id = excluded.tenant_id,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        updated_at = excluded.updated_at;
  return null;
end;
$$;

revoke all on function public.copy_google_integration_secrets() from public, anon, authenticated;

-- Every insert, and every update of the token columns, on a Google row.
drop trigger if exists copy_google_integration_secrets on public.tenant_integrations;
create trigger copy_google_integration_secrets
  after insert or update of api_key, settings, tenant_id on public.tenant_integrations
  for each row
  when (new.integration_type in ('google_analytics', 'google_search_console', 'google_ads'))
  execute function public.copy_google_integration_secrets();

-- Backfill: the tokens of every existing Google connection.
insert into public.integration_secrets (integration_id, tenant_id, access_token, refresh_token, updated_at)
select ti.id, ti.tenant_id, ti.api_key, ti.settings ->> 'refresh_token', now()
from public.tenant_integrations ti
where ti.integration_type in ('google_analytics', 'google_search_console', 'google_ads')
on conflict (integration_id) do update
  set tenant_id = excluded.tenant_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      updated_at = excluded.updated_at;

-- Guard: no policy and no browser grant on integration_secrets, and every
-- Google connection has its row.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'integration_secrets'
  ) then
    raise exception 'integration_secrets: a policy exists; the tokens must stay service-role only';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'integration_secrets'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'integration_secrets: anon or authenticated has a grant';
  end if;

  if exists (
    select 1 from public.tenant_integrations ti
    where ti.integration_type in ('google_analytics', 'google_search_console', 'google_ads')
      and not exists (
        select 1 from public.integration_secrets s where s.integration_id = ti.id
      )
  ) then
    raise exception 'integration_secrets: a Google connection was not backfilled';
  end if;
end;
$$;
