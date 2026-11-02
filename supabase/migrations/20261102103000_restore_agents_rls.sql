-- Agents studio tables have row-level security on and no policies in
-- Production and Staging (the Production baseline came without them), so a
-- signed-in user reads nothing and every save fails or matches no rows. This
-- restores the original tenant rules, TO authenticated only: the members of the
-- user's active tenant, or a super admin, as on ai_agents.
--
-- Same access as the original policies, never wider:
-- - Tenant-wide manage, as originally: agent_evals, agent_eval_runs,
--   agent_supervisors, agent_goals, agent_knowledge_folders,
--   agent_knowledge_items, agent_memory, agent_user_profiles.
-- - Read only (only edge functions write, with the service role):
--   agent_runs, social_publications.
-- - manus_tasks: read, create and update; manus-api saves and refreshes a
--   task with the user's own session. Nothing deletes one.
-- - agent_tools: global tools (tenant_id null) are readable by everyone
--   signed in and writable by no one, as the tool registry shows them; a
--   tenant's own tools are managed by its members.
-- - agent_batch_reports and agent_tool_embeddings stay without policies:
--   only edge functions use them, with the service role.
-- The originals of agent_user_profiles and agent_tools were TO public; these
-- are TO authenticated, so anon reads and writes nothing.

-- Members of the active tenant, or a super admin, manage the tenant's evals.
drop policy if exists agent_evals_all on public.agent_evals;
create policy agent_evals_all on public.agent_evals
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, manage the tenant's eval runs.
drop policy if exists agent_eval_runs_all on public.agent_eval_runs;
create policy agent_eval_runs_all on public.agent_eval_runs
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, manage the tenant's supervisors.
drop policy if exists agent_supervisors_all on public.agent_supervisors;
create policy agent_supervisors_all on public.agent_supervisors
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, manage the tenant's agent goals.
drop policy if exists agent_goals_all on public.agent_goals;
create policy agent_goals_all on public.agent_goals
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, manage the tenant's knowledge folders.
drop policy if exists agent_knowledge_folders_all on public.agent_knowledge_folders;
create policy agent_knowledge_folders_all on public.agent_knowledge_folders
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, manage the tenant's knowledge items.
drop policy if exists agent_knowledge_items_all on public.agent_knowledge_items;
create policy agent_knowledge_items_all on public.agent_knowledge_items
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, manage the tenant's agent memory.
drop policy if exists agent_memory_all on public.agent_memory;
create policy agent_memory_all on public.agent_memory
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, manage the tenant's contact profiles.
drop policy if exists agent_user_profiles_all on public.agent_user_profiles;
create policy agent_user_profiles_all on public.agent_user_profiles
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, read the tenant's agent runs.
drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, read the tenant's social publications.
drop policy if exists social_publications_select on public.social_publications;
create policy social_publications_select on public.social_publications
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, read the tenant's Manus tasks.
drop policy if exists manus_tasks_select on public.manus_tasks;
create policy manus_tasks_select on public.manus_tasks
  for select to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, save a Manus task for the tenant.
drop policy if exists manus_tasks_insert on public.manus_tasks;
create policy manus_tasks_insert on public.manus_tasks
  for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, refresh the tenant's Manus tasks.
drop policy if exists manus_tasks_update on public.manus_tasks;
create policy manus_tasks_update on public.manus_tasks
  for update to authenticated
  using (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())))
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Anyone signed in reads global tools; members of the active tenant, or a super admin, read the tenant's tools.
drop policy if exists agent_tools_select on public.agent_tools;
create policy agent_tools_select on public.agent_tools
  for select to authenticated
  using (tenant_id is null or tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid())));

-- Members of the active tenant, or a super admin, manage the tenant's own tools; global tools stay unwritable.
drop policy if exists agent_tools_write on public.agent_tools;
create policy agent_tools_write on public.agent_tools
  for all to authenticated
  using (tenant_id is not null and (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid()))))
  with check (tenant_id is not null and (tenant_id = public.get_user_tenant_id((select auth.uid())) or public.is_super_admin((select auth.uid()))));

-- Fails the migration if a table above still has no policy.
do $$
declare
  missing text;
begin
  select string_agg(t, ', ' order by t) into missing
  from unnest(array[
    'agent_evals', 'agent_eval_runs', 'agent_supervisors', 'agent_goals',
    'agent_knowledge_folders', 'agent_knowledge_items', 'agent_memory',
    'agent_user_profiles', 'agent_runs', 'social_publications', 'manus_tasks',
    'agent_tools'
  ]) as t
  where not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t
  );
  if missing is not null then
    raise exception 'agents RLS restore: no policy on %', missing;
  end if;
end;
$$;
