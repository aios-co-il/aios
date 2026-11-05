-- Carmen command center and goals: the row-level security policies the
-- Production baseline (20261009000000_production_baseline.sql) lost. These
-- nine tables have RLS on and no policy on Production and Staging (read-only
-- check, 2026-11-02), so a signed-in user reads no rows and every browser
-- write is refused: the Carmen tasks list, goals, the Heartbeat settings
-- panel, the approvals bell and the command center widgets stay empty.
--
-- The rule is the one these tables had, scoped to the user's active tenant
-- (get_user_tenant_id): members of the tenant read, and write where the
-- screens write. A super admin reads every tenant and writes only as the
-- tenant they act in (TENANT_ISOLATION.md). Writes that only edge functions
-- make get no policy, because the service role bypasses RLS.
--
-- - goals, agent_tasks: read, create, edit, delete.
-- - tenant_heartbeat_settings: read, create, edit (the panel upserts on
--   tenant_id). carmen_manager_settings_guard still refuses a non-owner's
--   change to the manager block of pulse_alert_rules, except its cost
--   thresholds, which every member may change.
-- - carmen_whatsapp_sessions: read, edit (pause, resume, end).
-- - heartbeat_logs, integration_alerts_log, integration_health,
--   agent_action_log: read only. The old open INSERT policies of
--   heartbeat_logs and agent_action_log are not restored.
-- - agent_approval_queue: read only. Approvals are decided on the server
--   (AIO-230, 20261026124000_approval_queue_server_decisions), whose grants
--   are left as they are.
--
-- No row changes. Safe to re-run: each policy is dropped before it is created.

drop policy if exists goals_select on public.goals;
drop policy if exists goals_insert on public.goals;
drop policy if exists goals_update on public.goals;
drop policy if exists goals_delete on public.goals;
drop policy if exists agent_tasks_select on public.agent_tasks;
drop policy if exists agent_tasks_insert on public.agent_tasks;
drop policy if exists agent_tasks_update on public.agent_tasks;
drop policy if exists agent_tasks_delete on public.agent_tasks;
drop policy if exists tenant_heartbeat_settings_select on public.tenant_heartbeat_settings;
drop policy if exists tenant_heartbeat_settings_insert on public.tenant_heartbeat_settings;
drop policy if exists tenant_heartbeat_settings_update on public.tenant_heartbeat_settings;
drop policy if exists heartbeat_logs_select on public.heartbeat_logs;
drop policy if exists carmen_whatsapp_sessions_select on public.carmen_whatsapp_sessions;
drop policy if exists carmen_whatsapp_sessions_update on public.carmen_whatsapp_sessions;
drop policy if exists integration_alerts_log_select on public.integration_alerts_log;
drop policy if exists integration_health_select on public.integration_health;
drop policy if exists agent_action_log_select on public.agent_action_log;
drop policy if exists agent_approval_queue_select on public.agent_approval_queue;

-- goals: read in the active tenant; a super admin reads every tenant.
create policy goals_select on public.goals
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- goals: create only in the active tenant.
create policy goals_insert on public.goals
  for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- goals: edit the active tenant's goals, which stay in that tenant.
create policy goals_update on public.goals
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- goals: delete the active tenant's goals.
create policy goals_delete on public.goals
  for delete to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- agent_tasks (the Carmen tasks list): read in the active tenant; a super admin reads every tenant.
create policy agent_tasks_select on public.agent_tasks
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- agent_tasks: create only in the active tenant.
create policy agent_tasks_insert on public.agent_tasks
  for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- agent_tasks: edit the active tenant's tasks, which stay in that tenant.
create policy agent_tasks_update on public.agent_tasks
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- agent_tasks: delete the active tenant's tasks.
create policy agent_tasks_delete on public.agent_tasks
  for delete to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- tenant_heartbeat_settings: read the active tenant's row; a super admin reads every tenant's.
create policy tenant_heartbeat_settings_select on public.tenant_heartbeat_settings
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- tenant_heartbeat_settings: create the active tenant's row (the insert half of the panel's upsert).
create policy tenant_heartbeat_settings_insert on public.tenant_heartbeat_settings
  for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- tenant_heartbeat_settings: any member edits the active tenant's row; the guard trigger keeps the manager block owner-only.
create policy tenant_heartbeat_settings_update on public.tenant_heartbeat_settings
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- heartbeat_logs: read in the active tenant; a super admin reads every tenant. Only edge functions write.
create policy heartbeat_logs_select on public.heartbeat_logs
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- carmen_whatsapp_sessions: read in the active tenant; a super admin reads every tenant.
create policy carmen_whatsapp_sessions_select on public.carmen_whatsapp_sessions
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- carmen_whatsapp_sessions: pause, resume or end the active tenant's sessions, which stay in that tenant.
create policy carmen_whatsapp_sessions_update on public.carmen_whatsapp_sessions
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- integration_alerts_log: read in the active tenant; a super admin reads every tenant. Only edge functions write.
create policy integration_alerts_log_select on public.integration_alerts_log
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- integration_health: read in the active tenant; a super admin reads every tenant. Only SECURITY DEFINER functions write.
create policy integration_health_select on public.integration_health
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- agent_action_log: read in the active tenant; a super admin reads every tenant. Only edge functions write.
create policy agent_action_log_select on public.agent_action_log
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- agent_approval_queue: read in the active tenant; a super admin reads every tenant. Decisions go through edge functions.
create policy agent_approval_queue_select on public.agent_approval_queue
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Every table of this group now has a policy.
do $$
declare
  v_bare text;
begin
  select string_agg(t.table_name, ', ' order by t.table_name)
  into v_bare
  from unnest(array[
    'goals', 'agent_tasks', 'tenant_heartbeat_settings', 'heartbeat_logs',
    'carmen_whatsapp_sessions', 'integration_alerts_log', 'integration_health',
    'agent_action_log', 'agent_approval_queue'
  ]) as t (table_name)
  where not exists (
    select 1 from pg_policies as p
    where p.schemaname = 'public' and p.tablename = t.table_name
  );
  if v_bare is not null then
    raise exception 'restore carmen command rls: no policy on %', v_bare;
  end if;
end;
$$;
