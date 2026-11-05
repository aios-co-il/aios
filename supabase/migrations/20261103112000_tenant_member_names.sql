-- Update feeds (client card, lead card, pulse call dialog) show who wrote each
-- update. They read the writer through a profiles embed, but profiles RLS shows
-- a non-owner only their own row ("Users can view profiles in their tenant"
-- resolves co-members through tenant_users, whose RLS shows a non-owner only
-- their own row), so every teammate's update read as a generic "משתמש".
--
-- tenant_member_names returns only the id and display name of a tenant's
-- members, to callers who belong to that tenant. Teammates' profiles rows
-- (phone, calendar_iframe_code, notification_group_link, status, ui_mode) stay
-- as private as before: profiles RLS is not changed.
--
-- An earlier draft of this PR (version 20261102130000, applied only on the PR's
-- Preview branch) replaced the profiles SELECT policy with one opening whole
-- rows to every teammate. The block below puts the baseline policy back and
-- drops that draft's helper; where the draft never ran it does nothing.
do $cleanup$
begin
  if to_regprocedure('public.user_shares_tenant_with(uuid)') is null then
    raise notice 'tenant_member_names: draft profiles policy not present, nothing to restore';
    return;
  end if;

  drop policy if exists "Users can view profiles in their tenant" on public.profiles;
  -- Baseline policy: profiles of users in the caller's tenants, as tenant_users RLS lets the caller see them.
  create policy "Users can view profiles in their tenant" on public.profiles
    for select
    using (id in (
      select tu1.user_id
      from public.tenant_users tu1
      where tu1.tenant_id in (
        select tu2.tenant_id from public.tenant_users tu2 where tu2.user_id = auth.uid()
      )
    ));
  drop function public.user_shares_tenant_with(uuid);
end
$cleanup$;

-- Id and display name (profile name, else the linked campaigner's name) of every member of p_tenant_id; refuses callers outside it.
create or replace function public.tenant_member_names(p_tenant_id uuid)
returns table (user_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (
    public.user_is_tenant_member(p_tenant_id)
    or public.is_super_admin((select auth.uid()))
  ) then
    raise exception 'tenant_member_names: only members of this organization may list its names'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(c.full_name), ''))
  from public.profiles p
  left join public.campaigners c on c.id = p.campaigner_id
  where p.id in (
    select tu.user_id from public.tenant_users tu where tu.tenant_id = p_tenant_id
    union
    select ur.user_id from public.user_roles ur where ur.tenant_id = p_tenant_id
  );
end;
$$;

revoke all on function public.tenant_member_names(uuid) from public, anon, authenticated;
grant execute on function public.tenant_member_names(uuid) to authenticated;
