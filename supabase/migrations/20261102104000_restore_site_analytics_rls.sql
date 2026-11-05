-- Site analytics access rules: restore the row-level security policies the
-- Production baseline (20261009000000) lost on the five site_* tables.
--
-- site_tracking_configs, site_visitors, site_sessions, site_pageviews and
-- site_events have RLS on and no policies in Production and Staging. A
-- signed-in user reads no rows there (Site analytics page, client analytics
-- dashboard, import dialog), and creating a tracking code fails with 42501.
--
-- The rule is the one these tables had before the baseline: members of a
-- tenant see its analytics and manage its tracking codes; a super admin
-- reaches every tenant. Visitors, sessions, page views and events are written
-- only by the analytics-track and analytics-identify edge functions with the
-- service role, which bypasses RLS, so those four tables get a read policy
-- only, as before (their old "Service role can ..." policies were redundant).
--
-- No data changes.

-- site_tracking_configs: the tenant's tracking codes, one per client site.

-- Members read their tenant's tracking codes; super admins read every tenant's.
drop policy if exists site_tracking_configs_select on public.site_tracking_configs;
create policy site_tracking_configs_select on public.site_tracking_configs
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members create tracking codes in their own tenant; super admins in any tenant.
drop policy if exists site_tracking_configs_insert on public.site_tracking_configs;
create policy site_tracking_configs_insert on public.site_tracking_configs
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members edit their tenant's tracking codes and cannot move one to another tenant; super admins any.
drop policy if exists site_tracking_configs_update on public.site_tracking_configs;
create policy site_tracking_configs_update on public.site_tracking_configs
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members delete their tenant's tracking codes; super admins any.
drop policy if exists site_tracking_configs_delete on public.site_tracking_configs;
create policy site_tracking_configs_delete on public.site_tracking_configs
  for delete to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Tracked data: read only for users; the analytics edge functions write it.

-- Members read their tenant's site visitors; super admins read every tenant's.
drop policy if exists site_visitors_select on public.site_visitors;
create policy site_visitors_select on public.site_visitors
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members read their tenant's site sessions; super admins read every tenant's.
drop policy if exists site_sessions_select on public.site_sessions;
create policy site_sessions_select on public.site_sessions
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members read their tenant's page views; super admins read every tenant's.
drop policy if exists site_pageviews_select on public.site_pageviews;
create policy site_pageviews_select on public.site_pageviews
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members read their tenant's tracked events; super admins read every tenant's.
drop policy if exists site_events_select on public.site_events;
create policy site_events_select on public.site_events
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Guard: every site_* table has policies, and none of them reaches anon.
do $$
declare
  v_tables text[] := array[
    'site_tracking_configs', 'site_visitors', 'site_sessions', 'site_pageviews', 'site_events'
  ];
  v_bare text;
  v_wide text;
begin
  select string_agg(t, ', ') into v_bare
  from unnest(v_tables) as t
  where not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t
  );
  if v_bare is not null then
    raise exception 'restore_site_analytics_rls: no policies on %', v_bare;
  end if;

  select string_agg(distinct p.tablename, ', ') into v_wide
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = any (v_tables)
    and p.roles <> array['authenticated']::name[];
  if v_wide is not null then
    raise exception 'restore_site_analytics_rls: a policy reaches more than authenticated on %', v_wide;
  end if;
end;
$$;
