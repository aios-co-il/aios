-- Google tokens encrypted at rest (AIO-608, security finding 5), for the
-- Analytics, Search Console and Ads connections in integration_secrets.
--
-- Each token is kept as a Supabase Vault secret, encrypted with a key the
-- database does not store, so a leaked backup or dump does not expose it. The
-- secret is named after its connection: google_integration_<kind>_<id>.
--
-- First of two steps. This one encrypts every token, old and new, and the edge
-- functions read the decrypted tokens through google_integration_tokens. The
-- plain copies in integration_secrets stay until a later migration drops them,
-- after these functions are live, so the deploy order does not matter.

-- The Vault secret name of a connection's token: the one place the naming lives.
create or replace function public.google_token_secret_name(p_kind text, p_integration_id uuid)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select format('google_integration_%s_%s', p_kind, p_integration_id)
$$;

revoke all on function public.google_token_secret_name(text, uuid) from public, anon, authenticated;

-- Stores one token of a connection in Vault: creates its secret, or replaces
-- its value. A null token leaves the stored one.
create or replace function public.store_google_token_in_vault(
  p_integration_id uuid,
  p_kind text,
  p_token text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := public.google_token_secret_name(p_kind, p_integration_id);
  v_secret_id uuid;
begin
  if p_token is null then
    return;
  end if;

  select s.id into v_secret_id from vault.secrets s where s.name = v_name;
  if v_secret_id is null then
    perform vault.create_secret(p_token, v_name, 'Google OAuth token of a tenant_integrations row (AIO-608)');
  else
    perform vault.update_secret(v_secret_id, p_token);
  end if;
end;
$$;

revoke all on function public.store_google_token_in_vault(uuid, text, text) from public, anon, authenticated;

-- Step 3's trigger function, now also encrypting both tokens into Vault.
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
  -- Step 3's check: an insert with an existing connection's id would store its
  -- tokens before ON CONFLICT DO NOTHING skips it.
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

  perform public.store_google_token_in_vault(new.id, 'access', v_access);
  perform public.store_google_token_in_vault(new.id, 'refresh', v_refresh);

  new.api_key := null;
  if jsonb_typeof(new.settings) = 'object' then
    new.settings := new.settings - 'refresh_token';
  end if;

  return new;
end;
$$;

-- A connection's Vault secrets go when its integration_secrets row goes,
-- which a deleted connection cascades to.
create or replace function public.delete_google_tokens_from_vault()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from vault.secrets
  where name in (
    public.google_token_secret_name('access', old.integration_id),
    public.google_token_secret_name('refresh', old.integration_id)
  );

  return null;
end;
$$;

revoke all on function public.delete_google_tokens_from_vault() from public, anon, authenticated;

drop trigger if exists delete_google_tokens_from_vault on public.integration_secrets;
create trigger delete_google_tokens_from_vault
  after delete on public.integration_secrets
  for each row
  execute function public.delete_google_tokens_from_vault();

-- The decrypted tokens of the given connections, for the edge functions
-- (service role only). A token not yet in Vault falls back to its plain copy.
create or replace function public.google_integration_tokens(p_integration_ids uuid[])
returns table (integration_id uuid, access_token text, refresh_token text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    s.integration_id,
    coalesce(
      (select d.decrypted_secret from vault.decrypted_secrets d
       where d.name = public.google_token_secret_name('access', s.integration_id)),
      s.access_token
    ),
    coalesce(
      (select d.decrypted_secret from vault.decrypted_secrets d
       where d.name = public.google_token_secret_name('refresh', s.integration_id)),
      s.refresh_token
    )
  from public.integration_secrets s
  where s.integration_id = any(p_integration_ids)
$$;

revoke all on function public.google_integration_tokens(uuid[]) from public, anon, authenticated;
grant execute on function public.google_integration_tokens(uuid[]) to service_role;

-- Encrypt the tokens already stored.
select public.store_google_token_in_vault(s.integration_id, 'access', s.access_token),
       public.store_google_token_in_vault(s.integration_id, 'refresh', s.refresh_token)
from public.integration_secrets s;

-- Guard: every stored token has its Vault secret, and no browser role may
-- decrypt.
do $$
begin
  if exists (
    select 1 from public.integration_secrets s
    where (s.access_token is not null and not exists (
             select 1 from vault.secrets v
             where v.name = public.google_token_secret_name('access', s.integration_id)))
       or (s.refresh_token is not null and not exists (
             select 1 from vault.secrets v
             where v.name = public.google_token_secret_name('refresh', s.integration_id)))
  ) then
    raise exception 'encrypt_google_tokens: a stored token has no Vault secret';
  end if;

  if has_function_privilege('authenticated', 'public.google_integration_tokens(uuid[])', 'execute')
     or has_function_privilege('anon', 'public.google_integration_tokens(uuid[])', 'execute') then
    raise exception 'encrypt_google_tokens: a browser role may decrypt Google tokens';
  end if;
end;
$$;
