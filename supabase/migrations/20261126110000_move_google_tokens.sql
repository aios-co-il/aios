-- Google tokens out of the browser's reach, step 3 of 3 (AIO-608, security
-- finding B). Steps 1 and 2: 20261126100000_integration_secrets.sql copies the
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
--   - Settings saved double-encoded (a JSON string holding the object) are
--     decoded, so a refresh token inside the text is moved as well.
--
-- Deploy after step 2's functions are live: they read integration_secrets.

-- The trigger writes the secrets row before its connection exists (a BEFORE
-- INSERT trigger), so the foreign key is checked at commit instead.
alter table public.integration_secrets
  alter constraint integration_secrets_integration_id_fkey deferrable initially deferred;

-- Settings saved double-encoded (a JSON string holding the object), decoded.
-- Any other value, and text that does not hold an object, is returned as it is.
create or replace function public.decoded_integration_settings(p_settings jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_decoded jsonb;
begin
  if jsonb_typeof(p_settings) is distinct from 'string' then
    return p_settings;
  end if;

  begin
    v_decoded := (p_settings #>> '{}')::jsonb;
  exception when data_exception or program_limit_exceeded then
    return p_settings;
  end;

  if jsonb_typeof(v_decoded) = 'object' then
    return v_decoded;
  end if;

  return p_settings;
end;
$$;

revoke all on function public.decoded_integration_settings(jsonb) from public, anon, authenticated;

-- Decode the Google rows saved that way before anything else, so the move
-- below treats them like every other row. updated_at keeps its value, and the
-- disconnect triggers stay off: a decoded needs_reauth is not a new disconnect.
alter table public.tenant_integrations disable trigger update_tenant_integrations_updated_at;
alter table public.tenant_integrations disable trigger on_integration_disconnected;
alter table public.tenant_integrations disable trigger on_integration_disconnect_event;

update public.tenant_integrations ti
set settings = public.decoded_integration_settings(ti.settings)
where public.is_google_integration_type(ti.integration_type)
  and jsonb_typeof(ti.settings) = 'string';

alter table public.tenant_integrations enable trigger on_integration_disconnect_event;
alter table public.tenant_integrations enable trigger on_integration_disconnected;
alter table public.tenant_integrations enable trigger update_tenant_integrations_updated_at;

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
  v_refresh text;
begin
  new.settings := public.decoded_integration_settings(new.settings);
  v_refresh := nullif(new.settings ->> 'refresh_token', '');

  -- An insert with an existing connection's id is refused here: under ON
  -- CONFLICT DO NOTHING the insert is skipped only after this trigger has run,
  -- so a member could otherwise replace another member's tokens.
  if tg_op = 'INSERT' and exists (select 1 from public.tenant_integrations ti where ti.id = new.id) then
    raise exception 'connection % already exists', new.id using errcode = 'unique_violation';
  end if;

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
--
-- updated_at keeps its value: the sync functions pick the newest connection
-- by it, and one statement would give every moved row the same time.
alter table public.tenant_integrations disable trigger update_tenant_integrations_updated_at;

update public.tenant_integrations ti
set api_key = ti.api_key,
    settings = case
      when (nullif(ti.api_key, '') is not null or nullif(ti.settings ->> 'refresh_token', '') is not null)
        and jsonb_typeof(coalesce(ti.settings, '{}'::jsonb)) = 'object'
        and nullif(ti.settings ->> 'google_email', '') is null
        and nullif(ti.settings ->> 'connected_at', '') is null
      then coalesce(ti.settings, '{}'::jsonb) || jsonb_build_object('connected_at', coalesce(ti.updated_at, ti.created_at))
      else ti.settings
    end
where public.is_google_integration_type(ti.integration_type)
  and (ti.api_key is not null or ti.settings ? 'refresh_token');

alter table public.tenant_integrations enable trigger update_tenant_integrations_updated_at;

-- Guard: no Google row holds a token, and every Google row has its secrets row.
do $$
begin
  if exists (
    select 1 from public.tenant_integrations ti
    where public.is_google_integration_type(ti.integration_type)
      and (
        ti.api_key is not null
        or ti.settings ? 'refresh_token'
        or (
          jsonb_typeof(ti.settings) = 'string'
          and (ti.settings #>> '{}') like '%refresh_token%'
        )
      )
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
