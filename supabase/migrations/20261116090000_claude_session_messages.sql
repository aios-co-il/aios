-- Claude Direct follow-ups into the cloud session a conversation already has (AIO-600).
--
-- One row per message handed to a Claude Code cloud session. The routine's first message
-- of a conversation is recorded as already sent (via = 'routine'); each follow-up is queued
-- (via = 'worker') and the claude-session worker, signed in to the Claude account, sends it.
-- The cloud session id is read from here only: agent_channel_sessions is writable by tenant
-- members, and a session id taken from it would let one tenant write into another's session.

create table public.claude_session_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  cloud_session_id text not null check (cloud_session_id ~ '^session_[A-Za-z0-9]+$'),
  via text not null check (via in ('routine', 'worker')),
  status text not null check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  -- The text to send. Cleared once the row is sent, failed or cancelled.
  prompt text,
  error text,
  worker text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz
);

comment on table public.claude_session_messages is
  'Messages handed to a Claude Code cloud session for Claude Direct. Service role only.';

-- The open session of a conversation: its newest sent message.
create index claude_session_messages_conversation_idx
  on public.claude_session_messages (tenant_id, conversation_id, created_at desc);

-- The worker's queue.
create index claude_session_messages_queued_idx
  on public.claude_session_messages (created_at) where status = 'queued';

-- No policies: only the service role (edge functions and the worker) reads or writes.
alter table public.claude_session_messages enable row level security;
revoke all on table public.claude_session_messages from public, anon, authenticated;
grant all on table public.claude_session_messages to service_role;

-- Claims the oldest queued follow-up no older than p_max_age_seconds. A follow-up left queued
-- longer than that was already answered through a new session, so it is cancelled instead of
-- being sent late. Concurrent workers skip rows another worker holds. Service role only.
create or replace function public.claim_claude_session_message(
  p_worker text default null,
  p_max_age_seconds integer default 60
)
returns setof public.claude_session_messages
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'claim_claude_session_message: service role only' using errcode = '42501';
  end if;

  update public.claude_session_messages as stale
     set status = 'cancelled',
         prompt = null,
         error = 'not claimed in time',
         finished_at = now()
   where stale.status = 'queued'
     and stale.created_at < now() - make_interval(secs => greatest(p_max_age_seconds, 1));

  return query
  update public.claude_session_messages as message
     set status = 'sending',
         worker = p_worker,
         claimed_at = now()
   where message.id = (
     select queued.id
       from public.claude_session_messages as queued
      where queued.status = 'queued'
      order by queued.created_at
      limit 1
      for update skip locked
   )
  returning message.*;
end;
$$;

revoke all on function public.claim_claude_session_message(text, integer) from public, anon, authenticated;
grant execute on function public.claim_claude_session_message(text, integer) to service_role;
