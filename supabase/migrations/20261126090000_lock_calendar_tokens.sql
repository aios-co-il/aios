-- Google Calendar tokens: server only (AIO-608, security finding 4).
--
-- calendar_tokens holds each user's Google Calendar access and refresh token.
-- Its policies let the owner select, insert, update and delete their own row,
-- and anon and authenticated had every grant, so a script in the user's
-- browser (an XSS bug, a malicious extension) could read the refresh token and
-- keep Calendar access after the user signs out, or write token values into
-- the row.
--
-- No browser code reads the table: the app asks google-calendar-auth `status`
-- for the connection, and every edge function that reads or writes tokens now
-- does it with the service role after authenticating the caller and filtering
-- by that caller's user_id. So calendar_tokens keeps no policies and no
-- browser grants, like gmail_tokens (20261102106000).
--
-- No data changes.

-- The owner's select, insert, update and delete policies (two copies of most): all go.
drop policy if exists "Users can delete their own calendar token" on public.calendar_tokens;
drop policy if exists "Users can delete their own calendar tokens" on public.calendar_tokens;
drop policy if exists "Users can insert their own calendar token" on public.calendar_tokens;
drop policy if exists "Users can insert their own calendar tokens" on public.calendar_tokens;
drop policy if exists "Users can read their own calendar token" on public.calendar_tokens;
drop policy if exists "Users can update their own calendar token" on public.calendar_tokens;
drop policy if exists "Users can update their own calendar tokens" on public.calendar_tokens;
drop policy if exists "Users can view their own calendar tokens" on public.calendar_tokens;

-- RLS stays on, so even a grant restored by mistake reaches no row.
alter table public.calendar_tokens enable row level security;

-- Only the service role (edge functions) reads and writes the table.
revoke all on table public.calendar_tokens from public, anon, authenticated;
grant all on table public.calendar_tokens to service_role;

-- Guard: no policy and no browser grant on calendar_tokens.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'calendar_tokens'
  ) then
    raise exception 'lock_calendar_tokens: calendar_tokens has a policy; its tokens must stay service-role only';
  end if;

  if exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = 'calendar_tokens'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'lock_calendar_tokens: PUBLIC, anon or authenticated still has a grant on calendar_tokens';
  end if;
end;
$$;
