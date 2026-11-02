-- AIO-296: the tenant that owns an agency sees and updates the agency's tasks
-- that were created from a tenant the agency is shared with.
--
-- A task carries the tenant its creator was working in (set_task_tenant_id
-- only fills in a missing tenant_id). A task opened on a shared agency from the
-- receiving tenant is stamped with that tenant, and every tasks read rule
-- except "Shared-agency cross-tenant task view" requires the viewer's tenant,
-- so the agency's own tenant could not see or complete it.
--
-- Tenant safety: a row qualifies only when the viewer's acting tenant owns the
-- agency (user_owns_agency) and the task's tenant holds it through a share
-- chain (tenant_holds_agency, 20261026095300). A task another tenant stamped
-- with an agency it was never shared stays hidden. Roles are those of the
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
-- of the agency's own tenant read its tasks stamped with a tenant it is shared with.
drop policy if exists "Own-agency task view across tenants" on public.tasks;
create policy "Own-agency task view across tenants"
  on public.tasks
  for select to authenticated
  using (
    agency_id is not null
    and tenant_id is distinct from public.get_user_tenant_id((select auth.uid()))
    and public.user_owns_agency((select auth.uid()), agency_id)
    and public.tenant_holds_agency(tenant_id, agency_id, false)
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
-- row must still belong to an owned agency held by its tenant afterwards.
drop policy if exists "Own-agency task update across tenants" on public.tasks;
create policy "Own-agency task update across tenants"
  on public.tasks
  for update to authenticated
  using (
    agency_id is not null
    and tenant_id is distinct from public.get_user_tenant_id((select auth.uid()))
    and public.user_owns_agency((select auth.uid()), agency_id)
    and public.tenant_holds_agency(tenant_id, agency_id, false)
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
    and public.tenant_holds_agency(tenant_id, agency_id, false)
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
