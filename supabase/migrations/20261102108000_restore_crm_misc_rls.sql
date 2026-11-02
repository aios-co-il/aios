-- CRM, tasks, time, leads and tenant admin access rules: restore the
-- row-level security policies the Production baseline (20261009000000) lost
-- on communication_logs, task_collaborators, time_entry_breaks,
-- lead_sales_people, calendar_shares, user_workspace_layout,
-- tenant_templates, terminology_presets, automation_shared_tenants,
-- automation_executions and error_logs.
--
-- These tables have RLS on and no policies in Production and Staging. A
-- signed-in user reads no rows there and every insert fails with 42501:
-- Production logs show empty communication_logs reads and 403s on its insert
-- ("new row violates row-level security policy"), and empty
-- task_collaborators and lead_sales_people reads. Edge functions use the
-- service role and are unaffected. maskyoo_manual_overrides keeps no
-- policies: nothing reads it.
--
-- The rule (David): permissions stay as they are. Nobody gets wider access
-- than the app's permission model gives. Changes against the policies these
-- tables had before the baseline:
-- - Every policy is TO authenticated; many were TO public, which included anon.
-- - communication_logs follows client visibility (user_can_access_client, the
--   rule of the clients policies). It was tenant-wide, and a FOR ALL policy let
--   any member edit or delete any log in any of their tenants. Logs are now
--   read and added only, as the app does.
-- - task_collaborators follows task visibility (the intent of
--   20260922104500_task_collaborators_task_access_rls), not the tenant.
-- - lead_sales_people: the owner and team managers read the tenant's
--   assignments, a sales person reads their own. Every member could read them.
-- - terminology_presets: a super_admin role scoped to a tenant no longer counts
--   as a super admin (is_super_admin requires tenant_id null).
-- - error_logs: super admins read; nobody inserts through the API (anon could).
-- - automation_executions: members read their tenant's runs, so the Visual
--   Workspace can count them. It never had a policy in a migration.
-- - time_entry_breaks: the active tenant, like time_entries, not every tenant
--   of the user.
--
-- No recursion: task_collaborators reads tasks, and no policy on tasks or on
-- the tables its policies read reads task_collaborators. The leads sales-person
-- policy reads lead_sales_people, whose policies read no table.
--
-- No data changes.

-- communication_logs: the client mood and interaction log on the client card, CRM alerts and health scores.

-- A user reads the logs of clients they can see; super admins read every log.
drop policy if exists communication_logs_select on public.communication_logs;
create policy communication_logs_select on public.communication_logs
  for select to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or public.user_can_access_client((select auth.uid()), client_id)
  );

-- A user logs only for a client they can see, in their active tenant; super admins anywhere.
drop policy if exists communication_logs_insert on public.communication_logs;
create policy communication_logs_insert on public.communication_logs
  for insert to authenticated
  with check (
    public.is_super_admin((select auth.uid()))
    or (
      tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.user_can_access_client((select auth.uid()), client_id)
    )
  );

-- task_collaborators: extra campaigners on a task.

-- A user reads the collaborators of tasks they can see.
drop policy if exists task_collaborators_select on public.task_collaborators;
create policy task_collaborators_select on public.task_collaborators
  for select to authenticated
  using (exists (select 1 from public.tasks as t where t.id = task_collaborators.task_id));

-- A user adds collaborators to a task they can see, and the row carries the task's tenant.
drop policy if exists task_collaborators_insert on public.task_collaborators;
create policy task_collaborators_insert on public.task_collaborators
  for insert to authenticated
  with check (tenant_id = (select t.tenant_id from public.tasks as t where t.id = task_collaborators.task_id));

-- A user removes collaborators from a task they can see.
drop policy if exists task_collaborators_delete on public.task_collaborators;
create policy task_collaborators_delete on public.task_collaborators
  for delete to authenticated
  using (exists (select 1 from public.tasks as t where t.id = task_collaborators.task_id));

-- time_entry_breaks: breaks inside a time entry (Time Tracking).

-- Members manage breaks in their active tenant, as time_entries; super admins in every tenant.
drop policy if exists time_entry_breaks_manage on public.time_entry_breaks;
create policy time_entry_breaks_manage on public.time_entry_breaks
  for all to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- lead_sales_people: which sales people a lead is assigned to.

-- The owner and team managers read the tenant's assignments, a sales person their own; super admins all.
drop policy if exists lead_sales_people_select on public.lead_sales_people;
create policy lead_sales_people_select on public.lead_sales_people
  for select to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or (
      tenant_id = public.get_user_tenant_id((select auth.uid()))
      and (
        public.has_role((select auth.uid()), 'owner'::public.app_role)
        or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
        or sales_person_id = public.get_user_sales_person_id((select auth.uid()))
      )
    )
  );

-- The owner and team managers assign sales people in their active tenant; super admins anywhere.
drop policy if exists lead_sales_people_insert on public.lead_sales_people;
create policy lead_sales_people_insert on public.lead_sales_people
  for insert to authenticated
  with check (
    public.is_super_admin((select auth.uid()))
    or (
      tenant_id = public.get_user_tenant_id((select auth.uid()))
      and (
        public.has_role((select auth.uid()), 'owner'::public.app_role)
        or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      )
    )
  );

-- The owner and team managers change assignments in their active tenant; super admins anywhere.
drop policy if exists lead_sales_people_update on public.lead_sales_people;
create policy lead_sales_people_update on public.lead_sales_people
  for update to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or (
      tenant_id = public.get_user_tenant_id((select auth.uid()))
      and (
        public.has_role((select auth.uid()), 'owner'::public.app_role)
        or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      )
    )
  )
  with check (
    public.is_super_admin((select auth.uid()))
    or (
      tenant_id = public.get_user_tenant_id((select auth.uid()))
      and (
        public.has_role((select auth.uid()), 'owner'::public.app_role)
        or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      )
    )
  );

-- The owner and team managers remove assignments in their active tenant; super admins anywhere.
drop policy if exists lead_sales_people_delete on public.lead_sales_people;
create policy lead_sales_people_delete on public.lead_sales_people
  for delete to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or (
      tenant_id = public.get_user_tenant_id((select auth.uid()))
      and (
        public.has_role((select auth.uid()), 'owner'::public.app_role)
        or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      )
    )
  );

-- calendar_shares: a user's calendar shared with a colleague (read by user_has_calendar_access).

-- Both sides of a share read it; super admins read every share.
drop policy if exists calendar_shares_select on public.calendar_shares;
create policy calendar_shares_select on public.calendar_shares
  for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    or shared_with_user_id = (select auth.uid())
    or public.is_super_admin((select auth.uid()))
  );

-- A user shares only their own calendar, in their active tenant.
drop policy if exists calendar_shares_insert on public.calendar_shares;
create policy calendar_shares_insert on public.calendar_shares
  for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  );

-- The calendar's owner edits a share, and keeps it theirs and in their active tenant.
drop policy if exists calendar_shares_update on public.calendar_shares;
create policy calendar_shares_update on public.calendar_shares
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (
    owner_user_id = (select auth.uid())
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  );

-- The calendar's owner removes a share.
drop policy if exists calendar_shares_delete on public.calendar_shares;
create policy calendar_shares_delete on public.calendar_shares
  for delete to authenticated
  using (owner_user_id = (select auth.uid()));

-- user_workspace_layout: each user's Visual Workspace panel positions.

-- A user manages only their own layout rows.
drop policy if exists user_workspace_layout_own on public.user_workspace_layout;
create policy user_workspace_layout_own on public.user_workspace_layout
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- tenant_templates: a tenant saved as a template for new tenants.

-- A user reads public templates and their active tenant's; super admins read all.
drop policy if exists tenant_templates_select on public.tenant_templates;
create policy tenant_templates_select on public.tenant_templates
  for select to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or is_public = true
    or source_tenant_id = public.get_user_tenant_id((select auth.uid()))
  );

-- The owner saves their active tenant as a template; super admins any tenant.
drop policy if exists tenant_templates_insert on public.tenant_templates;
create policy tenant_templates_insert on public.tenant_templates
  for insert to authenticated
  with check (
    public.is_super_admin((select auth.uid()))
    or (
      source_tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_role((select auth.uid()), 'owner'::public.app_role)
    )
  );

-- The owner edits their active tenant's templates; super admins any.
drop policy if exists tenant_templates_update on public.tenant_templates;
create policy tenant_templates_update on public.tenant_templates
  for update to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or (
      source_tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_role((select auth.uid()), 'owner'::public.app_role)
    )
  )
  with check (
    public.is_super_admin((select auth.uid()))
    or (
      source_tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_role((select auth.uid()), 'owner'::public.app_role)
    )
  );

-- The owner removes their active tenant's templates; super admins any.
drop policy if exists tenant_templates_delete on public.tenant_templates;
create policy tenant_templates_delete on public.tenant_templates
  for delete to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or (
      source_tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_role((select auth.uid()), 'owner'::public.app_role)
    )
  );

-- terminology_presets: saved sets of tenant terminology.

-- A user reads public presets and their own; super admins read all.
drop policy if exists terminology_presets_select on public.terminology_presets;
create policy terminology_presets_select on public.terminology_presets
  for select to authenticated
  using (
    is_public = true
    or created_by_user_id = (select auth.uid())
    or public.is_super_admin((select auth.uid()))
  );

-- A user manages the presets they created.
drop policy if exists terminology_presets_own on public.terminology_presets;
create policy terminology_presets_own on public.terminology_presets
  for all to authenticated
  using (created_by_user_id = (select auth.uid()))
  with check (created_by_user_id = (select auth.uid()));

-- Super admins (a super_admin role with no tenant) manage every preset.
drop policy if exists terminology_presets_super_admin on public.terminology_presets;
create policy terminology_presets_super_admin on public.terminology_presets
  for all to authenticated
  using (public.is_super_admin((select auth.uid())))
  with check (public.is_super_admin((select auth.uid())));

-- automation_shared_tenants: an automation shared from its tenant to another.

-- Members of the target tenant or of the automation's tenant read the share; super admins all.
drop policy if exists automation_shared_tenants_select on public.automation_shared_tenants;
create policy automation_shared_tenants_select on public.automation_shared_tenants
  for select to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or public.user_is_tenant_member(tenant_id)
    or public.is_user_in_automation_source_tenant(automation_id, (select auth.uid()))
  );

-- An owner, agency owner or team manager of the automation's tenant shares it; super admins any.
drop policy if exists automation_shared_tenants_insert on public.automation_shared_tenants;
create policy automation_shared_tenants_insert on public.automation_shared_tenants
  for insert to authenticated
  with check (
    public.is_super_admin((select auth.uid()))
    or public.is_user_admin_of_automation_source_tenant(automation_id, (select auth.uid()))
  );

-- An owner, agency owner or team manager of the automation's tenant stops a share; super admins any.
drop policy if exists automation_shared_tenants_delete on public.automation_shared_tenants;
create policy automation_shared_tenants_delete on public.automation_shared_tenants
  for delete to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or public.is_user_admin_of_automation_source_tenant(automation_id, (select auth.uid()))
  );

-- automation_executions: automation runs, written by trigger-automation with the service role.

-- Members read their active tenant's runs; super admins read every tenant's.
drop policy if exists automation_executions_select on public.automation_executions;
create policy automation_executions_select on public.automation_executions
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- error_logs: errors recorded by report-error and other edge functions with the service role.

-- Only super admins read error logs.
drop policy if exists error_logs_super_admin_select on public.error_logs;
create policy error_logs_super_admin_select on public.error_logs
  for select to authenticated
  using (public.is_super_admin((select auth.uid())));

do $$
declare
  v_bare text;
begin
  select string_agg(t, ', ' order by t) into v_bare
  from unnest(array[
    'communication_logs', 'task_collaborators', 'time_entry_breaks', 'lead_sales_people',
    'calendar_shares', 'user_workspace_layout', 'tenant_templates', 'terminology_presets',
    'automation_shared_tenants', 'automation_executions', 'error_logs'
  ]) as t
  where not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t
  );
  if v_bare is not null then
    raise exception 'Still without policies: %', v_bare;
  end if;
end;
$$;
