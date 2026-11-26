-- Green API webhook calls verified by a per-line token (AIO-TBD, security fix).
--
-- green-api-webhook accepted any POST naming a known instance id, so anyone who
-- knew one could post a forged incoming message and wake Carmen. Green API
-- sends the instance's webhookUrlToken setting in the Authorization header of
-- every webhook call; configure-green-api now sets a random token per line and
-- stores it here, and green-api-webhook refuses a call without it.
--
-- The token is a Supabase Vault secret, like the Google tokens of AIO-608
-- (20261126150000_encrypt_google_tokens.sql), named after its line:
-- green_api_webhook_current_<id>. When a line is given a new token, the one it
-- replaces stays as green_api_webhook_previous_<id>: Green API applies new
-- settings within 5 minutes, so calls still carry the old token for a while.
-- The webhook reads the secret's created_at to know when the token was set.
--
-- No data changes: a line without a stored token keeps working as before, and
-- its calls are logged as tokenless until its owner refreshes its webhook
-- settings (docs/agents/carmen.md, "Green API webhook token").

-- The Vault secret name of a line's webhook token: the one place the naming lives.
create or replace function public.green_api_webhook_secret_name(p_kind text, p_integration_id uuid)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select format('green_api_webhook_%s_%s', p_kind, p_integration_id)
$$;

revoke all on function public.green_api_webhook_secret_name(text, uuid) from public, anon, authenticated;

-- Stores a new webhook token for a Green API line (configure-green-api, after
-- Green API saved it). The token it replaces becomes the previous one; a line
-- with no token keeps no previous one. Both secrets are recreated so their
-- created_at is the time this token was set.
create or replace function public.store_green_api_webhook_token(p_integration_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_current_name text := public.green_api_webhook_secret_name('current', p_integration_id);
  v_previous_name text := public.green_api_webhook_secret_name('previous', p_integration_id);
  v_replaced text;
begin
  if nullif(p_token, '') is null then
    raise exception 'store_green_api_webhook_token: empty token' using errcode = 'invalid_parameter_value';
  end if;

  if not exists (
    select 1 from public.tenant_integrations ti
    where ti.id = p_integration_id and ti.integration_type = 'green_api'
  ) then
    raise exception 'store_green_api_webhook_token: % is not a Green API line', p_integration_id
      using errcode = 'invalid_parameter_value';
  end if;

  select d.decrypted_secret into v_replaced
  from vault.decrypted_secrets d where d.name = v_current_name;

  delete from vault.secrets where name in (v_current_name, v_previous_name);

  if v_replaced is not null then
    perform vault.create_secret(v_replaced, v_previous_name, 'Replaced Green API webhook token, kept while Green API applies the new one');
  end if;
  perform vault.create_secret(p_token, v_current_name, 'Green API webhook token of a tenant_integrations row');
end;
$$;

revoke all on function public.store_green_api_webhook_token(uuid, text) from public, anon, authenticated;
grant execute on function public.store_green_api_webhook_token(uuid, text) to service_role;

-- A line's webhook tokens for green-api-webhook (service role only): no row
-- when the line has no token, which the webhook treats as not yet enforced.
create or replace function public.green_api_webhook_tokens(p_integration_id uuid)
returns table (current_token text, previous_token text, set_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    cur.decrypted_secret,
    (select prev.decrypted_secret from vault.decrypted_secrets prev
     where prev.name = public.green_api_webhook_secret_name('previous', p_integration_id)),
    cur.created_at
  from vault.decrypted_secrets cur
  where cur.name = public.green_api_webhook_secret_name('current', p_integration_id)
$$;

revoke all on function public.green_api_webhook_tokens(uuid) from public, anon, authenticated;
grant execute on function public.green_api_webhook_tokens(uuid) to service_role;

-- Forgets a line's webhook tokens when the line is deleted, or when it moves
-- to another instance or type: the new instance was not given the token, so
-- keeping it would refuse every call until the next refresh.
create or replace function public.forget_green_api_webhook_tokens()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE'
     and new.instance_id is not distinct from old.instance_id
     and new.integration_type is not distinct from old.integration_type then
    raise notice 'forget_green_api_webhook_tokens: line % kept its instance; tokens kept', old.id;
    return null;
  end if;

  -- DELETE, or an UPDATE that moved the line to another instance or type.

  delete from vault.secrets
  where name in (
    public.green_api_webhook_secret_name('current', old.id),
    public.green_api_webhook_secret_name('previous', old.id)
  );

  return null;
end;
$$;

revoke all on function public.forget_green_api_webhook_tokens() from public, anon, authenticated;

drop trigger if exists forget_green_api_webhook_tokens on public.tenant_integrations;
create trigger forget_green_api_webhook_tokens
  after update of instance_id, integration_type or delete on public.tenant_integrations
  for each row
  when (old.integration_type = 'green_api')
  execute function public.forget_green_api_webhook_tokens();

-- Guard: no browser role may read or set a webhook token.
do $$
begin
  if has_function_privilege('authenticated', 'public.green_api_webhook_tokens(uuid)', 'execute')
     or has_function_privilege('anon', 'public.green_api_webhook_tokens(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.store_green_api_webhook_token(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.store_green_api_webhook_token(uuid, text)', 'execute') then
    raise exception 'green_api_webhook_token: a browser role may read or set a webhook token';
  end if;
end;
$$;
