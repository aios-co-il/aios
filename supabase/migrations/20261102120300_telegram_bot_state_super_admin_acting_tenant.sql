-- Telegram bots: a super admin connects and disconnects the bot of the tenant
-- they act in again. 20261102113900_restore_messaging_settings_rls (#1022)
-- gave telegram_bot_state_owner_insert, _update and _delete no super-admin
-- branch; before the baseline they were (owner of the acting tenant) or super
-- admin. A super admin acting in a tenant got 42501 from telegram-verify-bot's
-- upsert, and Disconnect changed no row. That migration is applied on Staging,
-- so this one corrects it.
--
-- The rule (TENANT_ISOLATION.md, as 20261102113700 applies it): a super admin
-- reads every tenant and writes only in the tenant they act in
-- (get_user_tenant_id). The three policies now accept the owner or a super
-- admin, in the acting tenant only, and a bot row stays in that tenant. The
-- insert still covers only the tenant's own bot (shared_from_state_id null).
-- Sharing and the other #1022 tables are unchanged.
--
-- The closing guard also covers what the earlier guards missed:
-- - the four #1022 tables and the nine Carmen command center tables
--   (20261102102000, whose guard 20261102120200 let a dropped policy pass)
--   have exactly the expected policies, by name and command;
-- - on the 51 tables of 20261102113700, whose guard checked names but not
--   commands, each policy is for the command its name states;
-- - every policy of the three groups is TO authenticated only.
--
-- No data changes. Safe to re-run: each policy is dropped before it is created.

-- The owner of the active tenant, or a super admin acting in it, adds the tenant's own bot; a shared copy goes
-- through telegram_bot_state_shared_insert.
drop policy if exists telegram_bot_state_owner_insert on public.telegram_bot_state;
create policy telegram_bot_state_owner_insert on public.telegram_bot_state
  for insert to authenticated
  with check (
    shared_from_state_id is null
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.is_super_admin((select auth.uid()))
    )
  );

-- The owner of the active tenant, or a super admin acting in it, edits its bot rows (connect, disconnect), which
-- stay in that tenant.
drop policy if exists telegram_bot_state_owner_update on public.telegram_bot_state;
create policy telegram_bot_state_owner_update on public.telegram_bot_state
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.is_super_admin((select auth.uid()))
    )
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.is_super_admin((select auth.uid()))
    )
  );

-- The owner of the active tenant, or a super admin acting in it, removes its bot rows.
drop policy if exists telegram_bot_state_owner_delete on public.telegram_bot_state;
create policy telegram_bot_state_owner_delete on public.telegram_bot_state
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.is_super_admin((select auth.uid()))
    )
  );

-- Guard. Permissive policies OR together, so a leftover, missing or widened policy would change access unnoticed.
do $$
declare
  v_problems text;
begin
  with expected (table_name, policy_name, command) as (
    values
      ('telephony_settings', 'telephony_settings_select', 'SELECT'),
      ('telephony_settings', 'telephony_settings_insert', 'INSERT'),
      ('telephony_settings', 'telephony_settings_update', 'UPDATE'),
      ('telegram_bot_state', 'telegram_bot_state_select', 'SELECT'),
      ('telegram_bot_state', 'telegram_bot_state_shared_select', 'SELECT'),
      ('telegram_bot_state', 'telegram_bot_state_owner_insert', 'INSERT'),
      ('telegram_bot_state', 'telegram_bot_state_owner_update', 'UPDATE'),
      ('telegram_bot_state', 'telegram_bot_state_owner_delete', 'DELETE'),
      ('telegram_bot_state', 'telegram_bot_state_shared_insert', 'INSERT'),
      ('telegram_bot_state', 'telegram_bot_state_shared_delete', 'DELETE'),
      ('telegram_messages', 'telegram_messages_select', 'SELECT'),
      ('telegram_messages', 'telegram_messages_insert', 'INSERT'),
      ('sync_jobs', 'sync_jobs_select', 'SELECT'),
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
  listed_tables as (
    select distinct table_name from expected
  ),
  -- The 51 tables of 20261102113700; its guard already fixed their policy names.
  named_tables (table_name) as (
    select unnest(array[
      'expense_payments', 'income_payments', 'one_time_incomes', 'invoice_uploads', 'supplier_invoices',
      'client_tenant_financial_data', 'finance', 'payment_links', 'agent_evals', 'agent_eval_runs',
      'agent_supervisors', 'agent_goals', 'agent_knowledge_folders', 'agent_knowledge_items', 'agent_memory',
      'agent_user_profiles', 'agent_runs', 'social_publications', 'manus_tasks', 'agent_tools',
      'agent_batch_reports', 'agent_tool_embeddings', 'site_tracking_configs', 'site_visitors', 'site_sessions',
      'site_pageviews', 'site_events', 'rank_tracking_projects', 'rank_tracking_keywords', 'rank_tracking_history',
      'rank_tracking_competitors', 'rank_tracking_alerts', 'rank_tracking_alert_logs', 'gmail_allowed_labels',
      'gmail_blocked_senders', 'gmail_category_rules', 'gmail_message_categories', 'gmail_categories',
      'gmail_tokens', 'communication_logs', 'task_collaborators', 'time_entry_breaks', 'lead_sales_people',
      'calendar_shares', 'user_workspace_layout', 'tenant_templates', 'terminology_presets',
      'automation_shared_tenants', 'automation_executions', 'error_logs', 'maskyoo_manual_overrides'
    ])
  ),
  live as (
    select p.tablename::text as table_name, p.policyname::text as policy_name, p.cmd, p.roles
    from pg_policies as p
    where p.schemaname = 'public'
      and (
        p.tablename::text in (select l.table_name from listed_tables as l)
        or p.tablename::text in (select n.table_name from named_tables as n)
      )
  ),
  problems (problem) as (
    select format('%s policy "%s" (%s) is not expected', l.table_name, l.policy_name, l.cmd)
    from live as l
    where l.table_name in (select t.table_name from listed_tables as t)
      and not exists (
        select 1 from expected as e
        where e.table_name = l.table_name and e.policy_name = l.policy_name and e.command = l.cmd
      )
    union all
    select format('%s is missing policy "%s" (%s)', e.table_name, e.policy_name, e.command)
    from expected as e
    where not exists (
      select 1 from live as l
      where l.table_name = e.table_name and l.policy_name = e.policy_name and l.cmd = e.command
    )
    union all
    -- A name ends in _select, _insert, _update or _delete (finance: "can view/insert/update/delete"), or the
    -- policy is FOR ALL.
    select format('%s policy "%s" is for %s, not the command its name states', l.table_name, l.policy_name, l.cmd)
    from live as l
    where l.table_name in (select n.table_name from named_tables as n)
      and l.cmd <> case
        when l.policy_name ~ '(_select$|can view )' then 'SELECT'
        when l.policy_name ~ '(_insert$|can insert )' then 'INSERT'
        when l.policy_name ~ '(_update$|can update )' then 'UPDATE'
        when l.policy_name ~ '(_delete$|can delete )' then 'DELETE'
        else 'ALL'
      end
    union all
    select format('%s policy "%s" applies to %s', l.table_name, l.policy_name, l.roles::text)
    from live as l
    where l.roles <> array['authenticated']::name[]
  )
  select string_agg(problem, '; ' order by problem) into v_problems from problems;

  if v_problems is not null then
    raise exception 'telegram_bot_state_super_admin_acting_tenant guard: %', v_problems;
  end if;
end;
$$;
