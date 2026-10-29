-- Carmen command center and goals: the closing guard every RLS restore
-- migration now ends with, for the nine tables of
-- 20261102102000_restore_carmen_command_rls.sql. That migration is already
-- applied on Staging, so the guard runs here instead of being added to it.
--
-- Permissive policies OR together, so one leftover or widened policy on these
-- tables would silently open them again. The deploy stops here if a table has
-- no policy, if a policy reaches a role other than authenticated, or if a
-- policy is not one of the 18 the restore created (by name and command).
--
-- No schema or row change.

do $$
declare
  v_problems text;
begin
  with expected (table_name, policy_name, command) as (
    values
      ('goals', 'goals_select', 'SELECT'),
      ('goals', 'goals_insert', 'INSERT'),
      ('goals', 'goals_update', 'UPDATE'),
      ('goals', 'goals_delete', 'DELETE'),
      ('agent_tasks', 'agent_tasks_select', 'SELECT'),
      ('agent_tasks', 'agent_tasks_insert', 'INSERT'),
      ('agent_tasks', 'agent_tasks_update', 'UPDATE'),
      ('agent_tasks', 'agent_tasks_delete', 'DELETE'),
      ('tenant_heartbeat_settings', 'tenant_heartbeat_settings_select', 'SELECT'),
      ('tenant_heartbeat_settings', 'tenant_heartbeat_settings_insert', 'INSERT'),
      ('tenant_heartbeat_settings', 'tenant_heartbeat_settings_update', 'UPDATE'),
      ('heartbeat_logs', 'heartbeat_logs_select', 'SELECT'),
      ('carmen_whatsapp_sessions', 'carmen_whatsapp_sessions_select', 'SELECT'),
      ('carmen_whatsapp_sessions', 'carmen_whatsapp_sessions_update', 'UPDATE'),
      ('integration_alerts_log', 'integration_alerts_log_select', 'SELECT'),
      ('integration_health', 'integration_health_select', 'SELECT'),
      ('agent_action_log', 'agent_action_log_select', 'SELECT'),
      ('agent_approval_queue', 'agent_approval_queue_select', 'SELECT')
  ),
  group_tables as (
    select distinct table_name from expected
  ),
  live as (
    select p.tablename::text as table_name, p.policyname::text as policy_name, p.cmd, p.roles
    from pg_policies as p
    join group_tables as g on g.table_name = p.tablename
    where p.schemaname = 'public'
  ),
  problems as (
    select g.table_name || ': no policy' as problem
    from group_tables as g
    where not exists (select 1 from live as l where l.table_name = g.table_name)
    union all
    select l.table_name || '.' || l.policy_name || ': roles ' || l.roles::text
    from live as l
    where l.roles <> array['authenticated']::name[]
    union all
    select l.table_name || '.' || l.policy_name || ' (' || l.cmd || '): not an expected policy'
    from live as l
    where not exists (
      select 1 from expected as e
      where e.table_name = l.table_name and e.policy_name = l.policy_name and e.command = l.cmd
    )
  )
  select string_agg(problem, '; ' order by problem) into v_problems from problems;

  if v_problems is not null then
    raise exception 'carmen command rls guard: %', v_problems;
  end if;
end;
$$;
