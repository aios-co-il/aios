-- Rank tracking access rules: restore the row-level security policies the
-- Production baseline (20261009000000) lost on the rank tracking tables the
-- app reads.
--
-- rank_tracking_projects, rank_tracking_keywords and rank_tracking_history
-- have RLS on and no policies in Production and Staging. A signed-in user
-- sees no projects, keywords or position history (Rank tracking pages, SEO
-- department, client card), and creating a project or adding keywords fails
-- with 42501.
--
-- The rule is the one these tables had before the baseline: members of a
-- tenant manage its projects and their keywords; a super admin reads, edits
-- and deletes in every tenant but creates only in their active tenant, as
-- before. Keywords and history have no tenant_id and follow their project.
-- History is written by serpapi-search with the service role, so users only
-- read it.
--
-- rank_tracking_competitors, rank_tracking_alerts and rank_tracking_alert_logs
-- keep no policies: nothing in the app or the edge functions uses them, so
-- they stay service-role only.
--
-- No data changes.

-- rank_tracking_projects

-- Members read their tenant's rank tracking projects; super admins read every tenant's.
drop policy if exists rank_tracking_projects_select on public.rank_tracking_projects;
create policy rank_tracking_projects_select on public.rank_tracking_projects
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members create projects in their own active tenant only (no super-admin branch, as before).
drop policy if exists rank_tracking_projects_insert on public.rank_tracking_projects;
create policy rank_tracking_projects_insert on public.rank_tracking_projects
  for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- Members edit their tenant's projects and cannot move one to another tenant; super admins any.
drop policy if exists rank_tracking_projects_update on public.rank_tracking_projects;
create policy rank_tracking_projects_update on public.rank_tracking_projects
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members delete their tenant's projects (keywords and history cascade); super admins any.
drop policy if exists rank_tracking_projects_delete on public.rank_tracking_projects;
create policy rank_tracking_projects_delete on public.rank_tracking_projects
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- rank_tracking_keywords: no tenant_id; access follows the keyword's project.
-- The projects policies read no other table, so these sublinks cannot recurse.

-- Members read the keywords of their tenant's projects; super admins every project's.
drop policy if exists rank_tracking_keywords_select on public.rank_tracking_keywords;
create policy rank_tracking_keywords_select on public.rank_tracking_keywords
  for select to authenticated
  using (
    exists (
      select 1
      from public.rank_tracking_projects p
      where p.id = rank_tracking_keywords.project_id
        and (
          p.tenant_id = public.get_user_tenant_id((select auth.uid()))
          or public.is_super_admin((select auth.uid()))
        )
    )
  );

-- Members add keywords to their active tenant's projects only (no super-admin branch, as before).
drop policy if exists rank_tracking_keywords_insert on public.rank_tracking_keywords;
create policy rank_tracking_keywords_insert on public.rank_tracking_keywords
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.rank_tracking_projects p
      where p.id = rank_tracking_keywords.project_id
        and p.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  );

-- Members edit keywords of their tenant's projects and cannot move one to another tenant's project; super admins any.
drop policy if exists rank_tracking_keywords_update on public.rank_tracking_keywords;
create policy rank_tracking_keywords_update on public.rank_tracking_keywords
  for update to authenticated
  using (
    exists (
      select 1
      from public.rank_tracking_projects p
      where p.id = rank_tracking_keywords.project_id
        and (
          p.tenant_id = public.get_user_tenant_id((select auth.uid()))
          or public.is_super_admin((select auth.uid()))
        )
    )
  )
  with check (
    exists (
      select 1
      from public.rank_tracking_projects p
      where p.id = rank_tracking_keywords.project_id
        and (
          p.tenant_id = public.get_user_tenant_id((select auth.uid()))
          or public.is_super_admin((select auth.uid()))
        )
    )
  );

-- Members delete keywords of their tenant's projects; super admins any.
drop policy if exists rank_tracking_keywords_delete on public.rank_tracking_keywords;
create policy rank_tracking_keywords_delete on public.rank_tracking_keywords
  for delete to authenticated
  using (
    exists (
      select 1
      from public.rank_tracking_projects p
      where p.id = rank_tracking_keywords.project_id
        and (
          p.tenant_id = public.get_user_tenant_id((select auth.uid()))
          or public.is_super_admin((select auth.uid()))
        )
    )
  );

-- rank_tracking_history: read only for users; serpapi-search writes it with the service role.

-- Members read the position history of their tenant's keywords; super admins every keyword's.
drop policy if exists rank_tracking_history_select on public.rank_tracking_history;
create policy rank_tracking_history_select on public.rank_tracking_history
  for select to authenticated
  using (
    exists (
      select 1
      from public.rank_tracking_keywords k
      join public.rank_tracking_projects p on p.id = k.project_id
      where k.id = rank_tracking_history.keyword_id
        and (
          p.tenant_id = public.get_user_tenant_id((select auth.uid()))
          or public.is_super_admin((select auth.uid()))
        )
    )
  );

-- Guard: the three tables the app reads have policies, and none of them reaches anon.
do $$
declare
  v_tables text[] := array['rank_tracking_projects', 'rank_tracking_keywords', 'rank_tracking_history'];
  v_bare text;
  v_wide text;
begin
  select string_agg(t, ', ') into v_bare
  from unnest(v_tables) as t
  where not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t
  );
  if v_bare is not null then
    raise exception 'restore_rank_tracking_rls: no policies on %', v_bare;
  end if;

  select string_agg(distinct p.tablename, ', ') into v_wide
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = any (v_tables)
    and p.roles <> array['authenticated']::name[];
  if v_wide is not null then
    raise exception 'restore_rank_tracking_rls: a policy reaches more than authenticated on %', v_wide;
  end if;
end;
$$;
