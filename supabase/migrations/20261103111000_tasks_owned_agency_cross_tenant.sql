-- AIO-296: the tenant that owns an agency sees and updates the agency's tasks
-- that were created from a tenant the agency is shared with directly.
--
-- A task carries the tenant its creator was working in (set_task_tenant_id
-- only fills in a missing tenant_id). A task opened on a shared agency from the
-- receiving tenant is stamped with that tenant, and every tasks read rule
-- except "Shared-agency cross-tenant task view" requires the viewer's tenant,
-- so the agency's own tenant could not see or complete it.
--
-- Tenant safety: a row qualifies only when the viewer's acting tenant owns the
-- agency (user_owns_agency) and shared it directly with the task's tenant (an
-- agency_tenant_access row from the acting tenant to that tenant). A task
-- another tenant stamped with an agency it was never shared stays hidden.
-- Re-shares (owner -> A -> B) are left out on purpose: the board reads its
-- (agency, tenant) pairs from agency_tenant_access, where only the agency's
-- owners see re-share rows, so it could not ask for them for every role. The
-- share row is read under the viewer's RLS; every
-- user of the source tenant sees it ("Users can view their tenant agency
-- access"), so each role below can match it. Roles are those of the
-- acting tenant (has_role), as in the in-tenant rules. Rows stamped with the
-- acting tenant are left to the in-tenant rules, so their visibility is
-- unchanged.
--
-- Super admins keep their existing read of every tenant; these policies add no
-- super-admin branch, so their writes stay in the acting tenant
-- (TENANT_ISOLATION.md). Additive permissive policies: the existing task rules
-- are unchanged. No data changes. Safe to re-run.
--
-- Replaces the policy part of PR #439. Its supabase/ops copy is not ported:
-- this migration is the only home of the rule.

-- Owners, managers of the agency, and the assigned campaigner or sales person
-- of the agency's own tenant read its tasks stamped with a tenant it shared the
-- agency with directly.
drop policy if exists "Own-agency task view across tenants" on public.tasks;
create policy "Own-agency task view across tenants"
  on public.tasks
  for select to authenticated
  using (
    agency_id is not null
    and tenant_id is distinct from public.get_user_tenant_id((select auth.uid()))
    and public.user_owns_agency((select auth.uid()), agency_id)
    and exists (
      select 1
      from public.agency_tenant_access ata
      where ata.agency_id = tasks.agency_id
        and ata.source_tenant_id = public.get_user_tenant_id((select auth.uid()))
        and ata.accessing_tenant_id = tasks.tenant_id
    )
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or (
        public.has_role((select auth.uid()), 'team_manager'::public.app_role)
        and public.user_manages_agency((select auth.uid()), agency_id)
      )
      or (
        campaigner_id is not null
        and campaigner_id = public.get_user_campaigner_id((select auth.uid()))
      )
      or (
        sales_person_id is not null
        and sales_person_id = public.get_user_sales_person_id((select auth.uid()))
      )
    )
  );

-- The same tenant updates those tasks with the in-tenant update roles, and the
-- row must still belong to an owned agency shared directly with its tenant
-- afterwards.
drop policy if exists "Own-agency task update across tenants" on public.tasks;
create policy "Own-agency task update across tenants"
  on public.tasks
  for update to authenticated
  using (
    agency_id is not null
    and tenant_id is distinct from public.get_user_tenant_id((select auth.uid()))
    and public.user_owns_agency((select auth.uid()), agency_id)
    and exists (
      select 1
      from public.agency_tenant_access ata
      where ata.agency_id = tasks.agency_id
        and ata.source_tenant_id = public.get_user_tenant_id((select auth.uid()))
        and ata.accessing_tenant_id = tasks.tenant_id
    )
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      or public.has_role((select auth.uid()), 'sales_person'::public.app_role)
      or (
        public.has_role((select auth.uid()), 'campaigner'::public.app_role)
        and campaigner_id = public.get_user_campaigner_id((select auth.uid()))
      )
    )
  )
  with check (
    agency_id is not null
    and tenant_id is distinct from public.get_user_tenant_id((select auth.uid()))
    and public.user_owns_agency((select auth.uid()), agency_id)
    and exists (
      select 1
      from public.agency_tenant_access ata
      where ata.agency_id = tasks.agency_id
        and ata.source_tenant_id = public.get_user_tenant_id((select auth.uid()))
        and ata.accessing_tenant_id = tasks.tenant_id
    )
    and (
      public.has_role((select auth.uid()), 'owner'::public.app_role)
      or public.has_role((select auth.uid()), 'team_manager'::public.app_role)
      or public.has_role((select auth.uid()), 'sales_person'::public.app_role)
      or (
        public.has_role((select auth.uid()), 'campaigner'::public.app_role)
        and campaigner_id = public.get_user_campaigner_id((select auth.uid()))
      )
    )
  );
