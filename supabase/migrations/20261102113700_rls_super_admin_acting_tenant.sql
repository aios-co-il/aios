-- Super admins write only in the tenant they act in, across the access rules
-- restored for finance (20261102100000), the agents studio (103000), site
-- analytics (104000), rank tracking (105000), Gmail (106000) and CRM, tasks,
-- time, leads and tenant admin (108000). Those migrations are applied on
-- Staging, so this one corrects them.
--
-- They gave most write policies an `or public.is_super_admin(...)` branch, so
-- a super admin could create rows in any tenant and edit, move to another
-- tenant or delete any tenant's rows. The rule (TENANT_ISOLATION.md, as
-- 20261102102000 already does it): a super admin reads every tenant and
-- writes only in the tenant they act in (get_user_tenant_id), like a member.
-- To work in another tenant they switch into it first.
--
-- - Each INSERT, UPDATE and DELETE policy loses its super-admin branch. Each
--   FOR ALL policy that had one becomes <table>_select (tenant or super admin)
--   and <table>_write (tenant only).
-- - Finance writes need has_finance_write_permission in the acting tenant,
--   which already accepts a super admin.
-- - lead_sales_people and automation_shared_tenants writes need a role; a
--   super admin keeps them only in the acting tenant.
-- - A super admin reads every task and client, so task_collaborators and
--   communication_logs writes reached other tenants through them; a super
--   admin now writes those only in the acting tenant. Other users keep the
--   task and client visibility rules.
-- - The one exception: tenant_templates and terminology_presets are global
--   catalogs that new tenants are built from, not one tenant's data. Their
--   super-admin writes stay as 20261102108000 made them.
-- - 20261102103000 says its rules are never wider than the originals. Its
--   super-admin writes in every tenant were; they are removed here. Its
--   super-admin reads of agent_user_profiles and agent_tools stay, under the
--   read-every-tenant rule.
-- - get_user_gmail_connection is granted to service_role too, like the
--   finance helpers.
--
-- Reads are unchanged, apart from the policy names of the split tables. No
-- data changes. Safe to re-run: each policy is dropped before it is created.
-- The closing guard checks every table of the six groups. The Carmen command
-- center group (20261102102000) has its own guard.

-- Finance

-- expense_payments

-- Finance writers add expense payments only in the tenant they act in.
drop policy if exists expense_payments_finance_insert on public.expense_payments;
create policy expense_payments_finance_insert on public.expense_payments
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers remove expense payments only in the tenant they act in.
drop policy if exists expense_payments_finance_delete on public.expense_payments;
create policy expense_payments_finance_delete on public.expense_payments
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- income_payments

-- Finance writers add income payments only in the tenant they act in.
drop policy if exists income_payments_finance_insert on public.income_payments;
create policy income_payments_finance_insert on public.income_payments
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers remove income payments only in the tenant they act in.
drop policy if exists income_payments_finance_delete on public.income_payments;
create policy income_payments_finance_delete on public.income_payments
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- one_time_incomes

-- Finance writers add one-time incomes only in the tenant they act in.
drop policy if exists one_time_incomes_finance_insert on public.one_time_incomes;
create policy one_time_incomes_finance_insert on public.one_time_incomes
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers edit one-time incomes only in the tenant they act in, and cannot move them out of it.
drop policy if exists one_time_incomes_finance_update on public.one_time_incomes;
create policy one_time_incomes_finance_update on public.one_time_incomes
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers remove one-time incomes only in the tenant they act in.
drop policy if exists one_time_incomes_finance_delete on public.one_time_incomes;
create policy one_time_incomes_finance_delete on public.one_time_incomes
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- invoice_uploads

-- Finance writers add uploaded invoices only in the tenant they act in.
drop policy if exists invoice_uploads_finance_insert on public.invoice_uploads;
create policy invoice_uploads_finance_insert on public.invoice_uploads
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers edit uploaded invoices only in the tenant they act in, and cannot move them out of it.
drop policy if exists invoice_uploads_finance_update on public.invoice_uploads;
create policy invoice_uploads_finance_update on public.invoice_uploads
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers remove uploaded invoices only in the tenant they act in.
drop policy if exists invoice_uploads_finance_delete on public.invoice_uploads;
create policy invoice_uploads_finance_delete on public.invoice_uploads
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- supplier_invoices

-- Finance writers add supplier invoices only in the tenant they act in.
drop policy if exists supplier_invoices_finance_insert on public.supplier_invoices;
create policy supplier_invoices_finance_insert on public.supplier_invoices
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers edit supplier invoices only in the tenant they act in, and cannot move them out of it.
drop policy if exists supplier_invoices_finance_update on public.supplier_invoices;
create policy supplier_invoices_finance_update on public.supplier_invoices
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers remove supplier invoices only in the tenant they act in.
drop policy if exists supplier_invoices_finance_delete on public.supplier_invoices;
create policy supplier_invoices_finance_delete on public.supplier_invoices
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- client_tenant_financial_data

-- Finance writers add client retainers and budgets only in the tenant they act in.
drop policy if exists client_tenant_financial_data_finance_insert on public.client_tenant_financial_data;
create policy client_tenant_financial_data_finance_insert on public.client_tenant_financial_data
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers edit client retainers and budgets only in the tenant they act in, and cannot move them out of it.
drop policy if exists client_tenant_financial_data_finance_update on public.client_tenant_financial_data;
create policy client_tenant_financial_data_finance_update on public.client_tenant_financial_data
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers remove client retainers and budgets only in the tenant they act in.
drop policy if exists client_tenant_financial_data_finance_delete on public.client_tenant_financial_data;
create policy client_tenant_financial_data_finance_delete on public.client_tenant_financial_data
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- finance

-- Finance writers add income and expense rows only in the tenant they act in.
drop policy if exists "Users with finance permission can insert finance" on public.finance;
create policy "Users with finance permission can insert finance" on public.finance
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers edit income and expense rows only in the tenant they act in, and cannot move them out of it.
drop policy if exists "Users with finance permission can update finance" on public.finance;
create policy "Users with finance permission can update finance" on public.finance
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Finance writers remove income and expense rows only in the tenant they act in.
drop policy if exists "Users with finance permission can delete finance" on public.finance;
create policy "Users with finance permission can delete finance" on public.finance
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Agents studio

-- The eight tenant-wide FOR ALL tables: read in the tenant or as a super admin, write only in the acting tenant.

drop policy if exists agent_evals_all on public.agent_evals;

-- Members read the tenant's evals; super admins read every tenant's.
drop policy if exists agent_evals_select on public.agent_evals;
create policy agent_evals_select on public.agent_evals
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members create, edit and delete evals only in the tenant they act in.
drop policy if exists agent_evals_write on public.agent_evals;
create policy agent_evals_write on public.agent_evals
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

drop policy if exists agent_eval_runs_all on public.agent_eval_runs;

-- Members read the tenant's eval runs; super admins read every tenant's.
drop policy if exists agent_eval_runs_select on public.agent_eval_runs;
create policy agent_eval_runs_select on public.agent_eval_runs
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members create, edit and delete eval runs only in the tenant they act in.
drop policy if exists agent_eval_runs_write on public.agent_eval_runs;
create policy agent_eval_runs_write on public.agent_eval_runs
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

drop policy if exists agent_supervisors_all on public.agent_supervisors;

-- Members read the tenant's supervisors; super admins read every tenant's.
drop policy if exists agent_supervisors_select on public.agent_supervisors;
create policy agent_supervisors_select on public.agent_supervisors
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members create, edit and delete supervisors only in the tenant they act in.
drop policy if exists agent_supervisors_write on public.agent_supervisors;
create policy agent_supervisors_write on public.agent_supervisors
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

drop policy if exists agent_goals_all on public.agent_goals;

-- Members read the tenant's agent goals; super admins read every tenant's.
drop policy if exists agent_goals_select on public.agent_goals;
create policy agent_goals_select on public.agent_goals
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members create, edit and delete agent goals only in the tenant they act in.
drop policy if exists agent_goals_write on public.agent_goals;
create policy agent_goals_write on public.agent_goals
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

drop policy if exists agent_knowledge_folders_all on public.agent_knowledge_folders;

-- Members read the tenant's knowledge folders; super admins read every tenant's.
drop policy if exists agent_knowledge_folders_select on public.agent_knowledge_folders;
create policy agent_knowledge_folders_select on public.agent_knowledge_folders
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members create, edit and delete knowledge folders only in the tenant they act in.
drop policy if exists agent_knowledge_folders_write on public.agent_knowledge_folders;
create policy agent_knowledge_folders_write on public.agent_knowledge_folders
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

drop policy if exists agent_knowledge_items_all on public.agent_knowledge_items;

-- Members read the tenant's knowledge items; super admins read every tenant's.
drop policy if exists agent_knowledge_items_select on public.agent_knowledge_items;
create policy agent_knowledge_items_select on public.agent_knowledge_items
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members create, edit and delete knowledge items only in the tenant they act in.
drop policy if exists agent_knowledge_items_write on public.agent_knowledge_items;
create policy agent_knowledge_items_write on public.agent_knowledge_items
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

drop policy if exists agent_memory_all on public.agent_memory;

-- Members read the tenant's agent memory; super admins read every tenant's.
drop policy if exists agent_memory_select on public.agent_memory;
create policy agent_memory_select on public.agent_memory
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members create, edit and delete agent memory only in the tenant they act in.
drop policy if exists agent_memory_write on public.agent_memory;
create policy agent_memory_write on public.agent_memory
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

drop policy if exists agent_user_profiles_all on public.agent_user_profiles;

-- Members read the tenant's contact profiles; super admins read every tenant's.
drop policy if exists agent_user_profiles_select on public.agent_user_profiles;
create policy agent_user_profiles_select on public.agent_user_profiles
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members create, edit and delete contact profiles only in the tenant they act in.
drop policy if exists agent_user_profiles_write on public.agent_user_profiles;
create policy agent_user_profiles_write on public.agent_user_profiles
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Members save a Manus task only in the tenant they act in.
drop policy if exists manus_tasks_insert on public.manus_tasks;
create policy manus_tasks_insert on public.manus_tasks
  for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Members refresh Manus tasks only in the tenant they act in, and cannot move one out of it.
drop policy if exists manus_tasks_update on public.manus_tasks;
create policy manus_tasks_update on public.manus_tasks
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Members manage tools only in the tenant they act in; a global tool (no tenant) never matches.
drop policy if exists agent_tools_write on public.agent_tools;
create policy agent_tools_write on public.agent_tools
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Site analytics

-- Members create tracking codes only in the tenant they act in.
drop policy if exists site_tracking_configs_insert on public.site_tracking_configs;
create policy site_tracking_configs_insert on public.site_tracking_configs
  for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Members edit tracking codes only in the tenant they act in, and cannot move one out of it.
drop policy if exists site_tracking_configs_update on public.site_tracking_configs;
create policy site_tracking_configs_update on public.site_tracking_configs
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Members delete tracking codes only in the tenant they act in.
drop policy if exists site_tracking_configs_delete on public.site_tracking_configs;
create policy site_tracking_configs_delete on public.site_tracking_configs
  for delete to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Rank tracking

-- Members edit projects only in the tenant they act in, and cannot move one out of it.
drop policy if exists rank_tracking_projects_update on public.rank_tracking_projects;
create policy rank_tracking_projects_update on public.rank_tracking_projects
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Members delete projects only in the tenant they act in (keywords and history cascade).
drop policy if exists rank_tracking_projects_delete on public.rank_tracking_projects;
create policy rank_tracking_projects_delete on public.rank_tracking_projects
  for delete to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Keywords follow their project. The projects policies read no other table, so these sublinks cannot recurse.

-- Members edit keywords of the acting tenant's projects, and cannot move one to another tenant's project.
drop policy if exists rank_tracking_keywords_update on public.rank_tracking_keywords;
create policy rank_tracking_keywords_update on public.rank_tracking_keywords
  for update to authenticated
  using (
    exists (
      select 1
      from public.rank_tracking_projects as p
      where p.id = rank_tracking_keywords.project_id
        and p.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  )
  with check (
    exists (
      select 1
      from public.rank_tracking_projects as p
      where p.id = rank_tracking_keywords.project_id
        and p.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  );

-- Members delete keywords of the acting tenant's projects.
drop policy if exists rank_tracking_keywords_delete on public.rank_tracking_keywords;
create policy rank_tracking_keywords_delete on public.rank_tracking_keywords
  for delete to authenticated
  using (
    exists (
      select 1
      from public.rank_tracking_projects as p
      where p.id = rank_tracking_keywords.project_id
        and p.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  );

-- Gmail

drop policy if exists gmail_categories_all on public.gmail_categories;

-- Members read the tenant's Gmail categories; super admins read every tenant's.
drop policy if exists gmail_categories_select on public.gmail_categories;
create policy gmail_categories_select on public.gmail_categories
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members manage Gmail categories only in the tenant they act in, and cannot move one out of it.
drop policy if exists gmail_categories_write on public.gmail_categories;
create policy gmail_categories_write on public.gmail_categories
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- CRM, tasks, time, leads and tenant admin

-- A user logs for a client they can see, in the tenant they act in; a super admin only for that tenant's clients.
drop policy if exists communication_logs_insert on public.communication_logs;
create policy communication_logs_insert on public.communication_logs
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and public.user_can_access_client((select auth.uid()), client_id)
    and (
      not public.is_super_admin((select auth.uid()))
      or public.get_client_tenant_id(client_id) = tenant_id
    )
  );

-- A user adds collaborators to a task they can see, in the task's tenant; a super admin only in the tenant they act in.
drop policy if exists task_collaborators_insert on public.task_collaborators;
create policy task_collaborators_insert on public.task_collaborators
  for insert to authenticated
  with check (
    tenant_id = (select t.tenant_id from public.tasks as t where t.id = task_collaborators.task_id)
    and (
      not public.is_super_admin((select auth.uid()))
      or tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  );

-- A user removes collaborators from a task they can see; a super admin only in the tenant they act in.
drop policy if exists task_collaborators_delete on public.task_collaborators;
create policy task_collaborators_delete on public.task_collaborators
  for delete to authenticated
  using (
    exists (select 1 from public.tasks as t where t.id = task_collaborators.task_id)
    and (
      not public.is_super_admin((select auth.uid()))
      or tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  );

drop policy if exists time_entry_breaks_manage on public.time_entry_breaks;

-- Members read breaks in the tenant they act in, as time_entries; super admins read every tenant's.
drop policy if exists time_entry_breaks_select on public.time_entry_breaks;
create policy time_entry_breaks_select on public.time_entry_breaks
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members add, end and delete breaks only in the tenant they act in.
drop policy if exists time_entry_breaks_write on public.time_entry_breaks;
create policy time_entry_breaks_write on public.time_entry_breaks
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- The owner, team managers and super admins assign sales people only in the tenant they act in.
drop policy if exists lead_sales_people_insert on public.lead_sales_people;
create policy lead_sales_people_insert on public.lead_sales_people
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      or public.is_super_admin((select auth.uid()))
    )
  );

-- The owner, team managers and super admins change assignments only in the tenant they act in, and keep them there.
drop policy if exists lead_sales_people_update on public.lead_sales_people;
create policy lead_sales_people_update on public.lead_sales_people
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      or public.is_super_admin((select auth.uid()))
    )
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      or public.is_super_admin((select auth.uid()))
    )
  );

-- The owner, team managers and super admins remove assignments only in the tenant they act in.
drop policy if exists lead_sales_people_delete on public.lead_sales_people;
create policy lead_sales_people_delete on public.lead_sales_people
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      or public.is_super_admin((select auth.uid()))
    )
  );

-- An owner, agency owner or team manager of the automation's tenant shares it; a super admin only an automation of the tenant they act in.
-- The automations policies read only tenants, so this sublink cannot recurse.
drop policy if exists automation_shared_tenants_insert on public.automation_shared_tenants;
create policy automation_shared_tenants_insert on public.automation_shared_tenants
  for insert to authenticated
  with check (
    public.is_user_admin_of_automation_source_tenant(automation_id, (select auth.uid()))
    or (
      public.is_super_admin((select auth.uid()))
      and exists (
        select 1
        from public.automations as a
        where a.id = automation_shared_tenants.automation_id
          and a.tenant_id = public.get_user_tenant_id((select auth.uid()))
      )
    )
  );

-- An owner, agency owner or team manager of the automation's tenant stops a share; a super admin only for an automation of the tenant they act in.
drop policy if exists automation_shared_tenants_delete on public.automation_shared_tenants;
create policy automation_shared_tenants_delete on public.automation_shared_tenants
  for delete to authenticated
  using (
    public.is_user_admin_of_automation_source_tenant(automation_id, (select auth.uid()))
    or (
      public.is_super_admin((select auth.uid()))
      and exists (
        select 1
        from public.automations as a
        where a.id = automation_shared_tenants.automation_id
          and a.tenant_id = public.get_user_tenant_id((select auth.uid()))
      )
    )
  );

-- Helpers: signed-in users and the service role may run the SECURITY DEFINER helpers these groups added.
grant execute on function public.get_user_gmail_connection() to authenticated, service_role;
grant execute on function public.has_finance_permission(uuid), public.has_finance_write_permission(uuid)
  to authenticated, service_role;

-- Guard: every table of the six groups has exactly the policies expected after this migration, all TO authenticated.
-- Permissive policies OR together, so a leftover policy would widen access unnoticed. A table expected with no
-- policies stays service-role only.
do $$
declare
  v_problems text;
begin
  with expected_tables (tablename, policynames) as (
    values
    ('expense_payments', array['expense_payments_finance_select', 'expense_payments_finance_insert', 'expense_payments_finance_delete']),
    ('income_payments', array['income_payments_finance_select', 'income_payments_finance_insert', 'income_payments_finance_delete']),
    ('one_time_incomes', array['one_time_incomes_finance_select', 'one_time_incomes_finance_insert', 'one_time_incomes_finance_update', 'one_time_incomes_finance_delete']),
    ('invoice_uploads', array['invoice_uploads_finance_select', 'invoice_uploads_finance_insert', 'invoice_uploads_finance_update', 'invoice_uploads_finance_delete']),
    ('supplier_invoices', array['supplier_invoices_finance_select', 'supplier_invoices_finance_insert', 'supplier_invoices_finance_update', 'supplier_invoices_finance_delete']),
    ('client_tenant_financial_data', array['client_tenant_financial_data_finance_select', 'client_tenant_financial_data_finance_insert', 'client_tenant_financial_data_finance_update', 'client_tenant_financial_data_finance_delete']),
    ('finance', array['Users with finance permission can view finance', 'Users with finance permission can insert finance', 'Users with finance permission can update finance', 'Users with finance permission can delete finance']),
    ('payment_links', array[]::text[]),
    ('agent_evals', array['agent_evals_select', 'agent_evals_write']),
    ('agent_eval_runs', array['agent_eval_runs_select', 'agent_eval_runs_write']),
    ('agent_supervisors', array['agent_supervisors_select', 'agent_supervisors_write']),
    ('agent_goals', array['agent_goals_select', 'agent_goals_write']),
    ('agent_knowledge_folders', array['agent_knowledge_folders_select', 'agent_knowledge_folders_write']),
    ('agent_knowledge_items', array['agent_knowledge_items_select', 'agent_knowledge_items_write']),
    ('agent_memory', array['agent_memory_select', 'agent_memory_write']),
    ('agent_user_profiles', array['agent_user_profiles_select', 'agent_user_profiles_write']),
    ('agent_runs', array['agent_runs_select']),
    ('social_publications', array['social_publications_select']),
    ('manus_tasks', array['manus_tasks_select', 'manus_tasks_insert', 'manus_tasks_update']),
    ('agent_tools', array['agent_tools_select', 'agent_tools_write']),
    ('agent_batch_reports', array[]::text[]),
    ('agent_tool_embeddings', array[]::text[]),
    ('site_tracking_configs', array['site_tracking_configs_select', 'site_tracking_configs_insert', 'site_tracking_configs_update', 'site_tracking_configs_delete']),
    ('site_visitors', array['site_visitors_select']),
    ('site_sessions', array['site_sessions_select']),
    ('site_pageviews', array['site_pageviews_select']),
    ('site_events', array['site_events_select']),
    ('rank_tracking_projects', array['rank_tracking_projects_select', 'rank_tracking_projects_insert', 'rank_tracking_projects_update', 'rank_tracking_projects_delete']),
    ('rank_tracking_keywords', array['rank_tracking_keywords_select', 'rank_tracking_keywords_insert', 'rank_tracking_keywords_update', 'rank_tracking_keywords_delete']),
    ('rank_tracking_history', array['rank_tracking_history_select']),
    ('rank_tracking_competitors', array[]::text[]),
    ('rank_tracking_alerts', array[]::text[]),
    ('rank_tracking_alert_logs', array[]::text[]),
    ('gmail_allowed_labels', array['gmail_allowed_labels_own']),
    ('gmail_blocked_senders', array['gmail_blocked_senders_own']),
    ('gmail_category_rules', array['gmail_category_rules_own']),
    ('gmail_message_categories', array['gmail_message_categories_own']),
    ('gmail_categories', array['gmail_categories_select', 'gmail_categories_write']),
    ('gmail_tokens', array[]::text[]),
    ('communication_logs', array['communication_logs_select', 'communication_logs_insert']),
    ('task_collaborators', array['task_collaborators_select', 'task_collaborators_insert', 'task_collaborators_delete']),
    ('time_entry_breaks', array['time_entry_breaks_select', 'time_entry_breaks_write']),
    ('lead_sales_people', array['lead_sales_people_select', 'lead_sales_people_insert', 'lead_sales_people_update', 'lead_sales_people_delete']),
    ('calendar_shares', array['calendar_shares_select', 'calendar_shares_insert', 'calendar_shares_update', 'calendar_shares_delete']),
    ('user_workspace_layout', array['user_workspace_layout_own']),
    ('tenant_templates', array['tenant_templates_select', 'tenant_templates_insert', 'tenant_templates_update', 'tenant_templates_delete']),
    ('terminology_presets', array['terminology_presets_select', 'terminology_presets_own', 'terminology_presets_super_admin']),
    ('automation_shared_tenants', array['automation_shared_tenants_select', 'automation_shared_tenants_insert', 'automation_shared_tenants_delete']),
    ('automation_executions', array['automation_executions_select']),
    ('error_logs', array['error_logs_super_admin_select']),
    ('maskyoo_manual_overrides', array[]::text[])
  ),
  expected as (
    select t.tablename, n.policyname
    from expected_tables as t
    cross join lateral unnest(t.policynames) as n (policyname)
  ),
  actual as (
    select p.tablename::text as tablename, p.policyname::text as policyname, p.roles
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename::text in (select t.tablename from expected_tables as t)
  )
  select string_agg(problem, '; ' order by problem) into v_problems
  from (
    select format('%s has no policies', t.tablename) as problem
    from expected_tables as t
    where cardinality(t.policynames) > 0
      and not exists (select 1 from actual as a where a.tablename = t.tablename)
    union all
    select format('%s has unexpected policy "%s"', a.tablename, a.policyname)
    from actual as a
    where not exists (
      select 1 from expected as e where e.tablename = a.tablename and e.policyname = a.policyname
    )
    union all
    select format('%s is missing policy "%s"', e.tablename, e.policyname)
    from expected as e
    where not exists (
      select 1 from actual as a where a.tablename = e.tablename and a.policyname = e.policyname
    )
    union all
    select format('%s policy "%s" applies to %s', a.tablename, a.policyname, a.roles::text)
    from actual as a
    where a.roles <> array['authenticated']::name[]
  ) as problems;

  if v_problems is not null then
    raise exception 'rls_super_admin_acting_tenant guard: %', v_problems;
  end if;
end;
$$;
