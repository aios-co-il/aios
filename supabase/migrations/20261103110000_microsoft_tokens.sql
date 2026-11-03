-- Microsoft 365 / Outlook connection (AIO-322, phase 1): one Microsoft
-- account per AIOS user, stored by microsoft-auth.
--
-- microsoft_tokens holds the user's Microsoft Graph access and refresh
-- tokens. Like gmail_tokens it has RLS on and no policies, so only the
-- service role (microsoft-auth, later the Graph functions) reads it, and
-- get_user_microsoft_connection tells the app the address and account type
-- alone. It is keyed by user, as gmail_tokens is: a connection follows its
-- user across tenants, and tenant_id records the tenant it was made from.
--
-- account_type is 'work' (Microsoft 365, work/school) or 'personal'
-- (outlook.com); Teams and OneDrive for Business need a work account.
-- last_refresh_error records why a token refresh failed, so the UI can ask
-- the user to reconnect.
--
-- No data changes.

create table if not exists public.microsoft_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text not null default '',
  microsoft_email text,
  ms_tenant_id text,
  account_type text not null check (account_type in ('work', 'personal')),
  last_refresh_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.microsoft_tokens enable row level security;

-- Tokens are service-role only: no browser role may touch the table.
revoke all on table public.microsoft_tokens from public, anon, authenticated;
grant all on table public.microsoft_tokens to service_role;

-- Returns the caller's Microsoft address and account type: one row when connected, none otherwise; never the tokens.
create or replace function public.get_user_microsoft_connection()
returns table (microsoft_email text, account_type text, needs_reconnect boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.microsoft_email, t.account_type, t.last_refresh_error is not null
  from public.microsoft_tokens t
  where t.user_id = (select auth.uid())
$$;

revoke all on function public.get_user_microsoft_connection() from public, anon, authenticated;
grant execute on function public.get_user_microsoft_connection() to authenticated;

-- Guard: microsoft_tokens has no policy and no browser grant.
do $$
begin
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'microsoft_tokens') then
    raise exception 'microsoft_tokens: has a policy; its tokens must stay service-role only';
  end if;

  if has_table_privilege('anon', 'public.microsoft_tokens', 'select')
     or has_table_privilege('authenticated', 'public.microsoft_tokens', 'select') then
    raise exception 'microsoft_tokens: a browser role can read the tokens';
  end if;
end;
$$;
