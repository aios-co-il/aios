-- Cursor Cloud Agent sessions (bc-…) that Carmen and the dev task center
-- start, per org and task.
--
-- The code that writes and reads this table (_shared/cursor-session-tracker.ts,
-- cursor-mcp, _shared/dev-tasks.ts, _shared/cursor-task-queue.ts and the
-- "סשני Cursor פעילים" panel) shipped in August with migrations that never
-- reached Production: the Production baseline (20261009000000) has neither
-- the table nor the tasks columns, so every write has failed since. This
-- creates them as that code expects. IF NOT EXISTS keeps it safe on a
-- database that already has them.
--
-- Reads: the org's staff and super admins. Writes: service role only (edge
-- functions). The table starts empty: nothing is backfilled and nothing is sent.

create table if not exists public.cursor_task_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cursor_agent_id text not null,
  session_url text,
  display_name text not null,
  human_task_id uuid references public.tasks(id) on delete set null,
  dev_task_id uuid references public.dev_tasks(id) on delete set null,
  task_title text,
  source_tool text not null,
  app_env text,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'busy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.cursor_task_sessions is
  'Cursor Cloud Agent bc-… sessions per org and task (cursor-session-tracker.ts).';

-- The tracker upserts on the agent id.
create unique index if not exists idx_cursor_task_sessions_agent
  on public.cursor_task_sessions (cursor_agent_id);

create index if not exists idx_cursor_task_sessions_tenant_status
  on public.cursor_task_sessions (tenant_id, status, updated_at desc);

create index if not exists idx_cursor_task_sessions_task
  on public.cursor_task_sessions (human_task_id)
  where human_task_id is not null;

create index if not exists idx_cursor_task_sessions_dev_task
  on public.cursor_task_sessions (dev_task_id)
  where dev_task_id is not null;

-- The tracker stamps the task's latest session and clears it when the task ends.
alter table public.tasks
  add column if not exists cursor_session_id text,
  add column if not exists cursor_session_url text;

comment on column public.tasks.cursor_session_id is
  'Latest Cursor Cloud Agent bc-… working on this task.';
comment on column public.tasks.cursor_session_url is
  'https://cursor.com/agents/bc-… for that session.';

alter table public.cursor_task_sessions enable row level security;

-- Staff of the org, and super admins (who view every org, TENANT_ISOLATION.md).
drop policy if exists "Staff read cursor_task_sessions" on public.cursor_task_sessions;
create policy "Staff read cursor_task_sessions" on public.cursor_task_sessions
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.tenant_id = cursor_task_sessions.tenant_id
    )
    or public.is_super_admin((select auth.uid()))
  );

revoke all on table public.cursor_task_sessions from anon, authenticated;
grant select on table public.cursor_task_sessions to authenticated;
grant all on table public.cursor_task_sessions to service_role;
