-- Google tokens out of the browser's reach, step 3 of 3 (AIO-608, security
-- finding B). Steps 1 and 2: 20261123120000_integration_secrets.sql copies the
-- tokens into integration_secrets, and the edge functions read them from there
-- (withGoogleTokens, which falls back to the row).
--
-- This migration moves the tokens instead of copying them:
--   - Every write of a Google row's api_key or settings.refresh_token now lands
--     in integration_secrets, and the row keeps neither. The edge functions
--     write the row as before; nothing in them changes.
--   - A write without a token keeps the stored one. Members saving a Search
--     Console site or an Analytics property from the browser never see the
--     refresh token, so their save used to drop it from the row.
--   - The tokens still on Google rows are moved, and the rows cleared.
--
-- Deploy after step 2's functions are live: they read integration_secrets.

-- The trigger writes the secrets row before its connection exists (a BEFORE
-- INSERT trigger), so the foreign key is checked at commit instead.
alter table public.integration_secrets
  alter constraint integration_secrets_integration_id_fkey deferrable initially deferred;

-- Moves a Google row's tokens into integration_secrets and clears them from
-- the row. A token the write does not carry keeps its stored value. Security
-- definer: members still edit their own Google rows from the browser.
create or replace function public.move_google_integration_secrets()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_access text := nullif(new.api_key, '');
  v_refresh text := nullif(new.settings ->> 'refresh_token', '');
begin
  insert into public.integration_secrets (integration_id, tenant_id, access_token, refresh_token, updated_at)
  values (new.id, new.tenant_id, v_access, v_refresh, now())
  on conflict (integration_id) do update
    set tenant_id = excluded.tenant_id,
        access_token = coalesce(excluded.access_token, integration_secrets.access_token),
        refresh_token = coalesce(excluded.refresh_token, integration_secrets.refresh_token),
        updated_at = excluded.updated_at;

  new.api_key := null;
  if jsonb_typeof(new.settings) = 'object' then
    new.settings := new.settings - 'refresh_token';
  end if;

  return new;
end;
$$;

revoke all on function public.move_google_integration_secrets() from public, anon, authenticated;

-- Replaces step 1's copy trigger: same events, but before the write, so the
-- row is saved without its tokens.
drop trigger if exists copy_google_integration_secrets on public.tenant_integrations;
drop function if exists public.copy_google_integration_secrets();

drop trigger if exists move_google_integration_secrets on public.tenant_integrations;
create trigger move_google_integration_secrets
  before insert or update of api_key, settings, tenant_id, integration_type on public.tenant_integrations
  for each row
  when (public.is_google_integration_type(new.integration_type))
  execute function public.move_google_integration_secrets();

-- Move the tokens still on Google rows: rewriting api_key runs the trigger,
-- which stores them and clears the row. A connection that only its tokens
-- marked as connected gets connected_at, which the browser reads instead
-- (src/lib/tenantIntegrationsClient.ts integrationHasCredential).
update public.tenant_integrations ti
set api_key = ti.api_key,
    settings = case
      when jsonb_typeof(ti.settings) = 'object'
        and nullif(ti.settings ->> 'google_email', '') is null
        and nullif(ti.settings ->> 'connected_at', '') is null
      then ti.settings || jsonb_build_object('connected_at', coalesce(ti.updated_at, ti.created_at))
      else ti.settings
    end
where public.is_google_integration_type(ti.integration_type)
  and (ti.api_key is not null or ti.settings ? 'refresh_token');

-- Guard: no Google row holds a token, and every Google row has its secrets row.
do $$
begin
  if exists (
    select 1 from public.tenant_integrations ti
    where public.is_google_integration_type(ti.integration_type)
      and (ti.api_key is not null or ti.settings ? 'refresh_token')
  ) then
    raise exception 'move_google_tokens: a Google row still holds a token';
  end if;

  if exists (
    select 1 from public.tenant_integrations ti
    where public.is_google_integration_type(ti.integration_type)
      and not exists (
        select 1 from public.integration_secrets s where s.integration_id = ti.id
      )
  ) then
    raise exception 'move_google_tokens: a Google connection has no secrets row';
  end if;
end;
$$;
