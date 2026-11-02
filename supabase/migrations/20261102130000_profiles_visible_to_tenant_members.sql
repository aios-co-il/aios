-- Teammates can read each other's profile, so update feeds show the writer's
-- name instead of a generic label.
--
-- "Users can view profiles in their tenant" resolved co-members through
-- tenant_users, but tenant_users RLS shows a non-owner only their own row
-- ("Users see own tenant_users"). The sub-select collapsed to the viewer, so a
-- campaigner could read one profile: their own. Every author line read through
-- profiles (client, lead and task updates) then fell back for everybody else.
--
-- The co-membership lookup now runs in a SECURITY DEFINER helper that skips
-- tenant_users RLS for that lookup only. Visibility stays what the policy
-- promised: users who share a tenant with the caller. The helper always checks
-- the caller (auth.uid()), never a viewer passed in, so it answers nothing
-- about other users' memberships. No data changes; safe to re-run.

-- True when the calling user and _target are members of at least one common tenant.
create or replace function public.user_shares_tenant_with(_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_users as viewer_tu
    join public.tenant_users as target_tu
      on target_tu.tenant_id = viewer_tu.tenant_id
    where viewer_tu.user_id = (select auth.uid())
      and target_tu.user_id = _target
  );
$$;

revoke all on function public.user_shares_tenant_with(uuid) from public, anon, authenticated;
grant execute on function public.user_shares_tenant_with(uuid) to authenticated;

-- Members read the profiles of users who share a tenant with them.
drop policy if exists "Users can view profiles in their tenant" on public.profiles;
create policy "Users can view profiles in their tenant" on public.profiles
  for select to authenticated
  using (public.user_shares_tenant_with(id));
