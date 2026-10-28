-- AIO-234 review fixes, Decision A (David, 27 Oct): a re-share must not outlive
-- the share it came from, and the agency's own tenant can revoke any share of
-- its agency.
--
-- 1. An owner of the agency's own tenant (agencies.tenant_id, through
--    user_owns_agency) may see, delete, and downgrade to read_only every
--    agency_tenant_access row for that agency, including re-shares other
--    tenants made. The source owner keeps its 20261026095300 rights. RLS sees
--    only the new row, so the downgrade policy also lets the agency owner move
--    a share to another tenant, or to another agency it owns, as read_only:
--    read access it could grant directly anyway.
drop policy if exists "Agency owners can view shares of their agency" on public.agency_tenant_access;
drop policy if exists "Agency owners can downgrade shares of their agency" on public.agency_tenant_access;
drop policy if exists "Agency owners can revoke shares of their agency" on public.agency_tenant_access;

-- Owners of the agency's tenant see every share of it, so they can revoke one.
create policy "Agency owners can view shares of their agency"
  on public.agency_tenant_access
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    and public.user_owns_agency(auth.uid(), agency_id)
  );

-- Owners of the agency's tenant turn any share of it read_only, never read_write.
create policy "Agency owners can downgrade shares of their agency"
  on public.agency_tenant_access
  for update to authenticated
  using (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    and public.user_owns_agency(auth.uid(), agency_id)
  )
  with check (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    and public.user_owns_agency(auth.uid(), agency_id)
    and access_level = 'read_only'
  );

-- Owners of the agency's tenant delete any share of it.
create policy "Agency owners can revoke shares of their agency"
  on public.agency_tenant_access
  for delete to authenticated
  using (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    and public.user_owns_agency(auth.uid(), agency_id)
  );

-- 2. agency_tenant_access_revoke_downstream: after a share is deleted,
--    downgraded from read_write, or moved to another source, agency or
--    accessing tenant, the tenant that had it is checked again with
--    tenant_holds_agency. When it no longer holds the agency, its own shares of
--    the agency are deleted; when it holds it only read_only, its read_write
--    shares of it become read_only. Those writes fire this trigger again, so
--    the check walks down the chain and around cycles until nothing changes.
--    Only that tenant's shares of that agency are written, so a row outside
--    the chain stays as it is, even one whose source never held the agency
--    (those are left to a decision on AIO-234). SECURITY DEFINER so the
--    cascade reaches rows the caller's RLS hides.
create or replace function public.agency_tenant_access_revoke_downstream()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A DELETE always checks again. An UPDATE that keeps the tenants, the
  -- agency and write access takes nothing away.
  if tg_op = 'UPDATE' then
    if new.source_tenant_id = old.source_tenant_id
       and new.agency_id = old.agency_id
       and new.accessing_tenant_id = old.accessing_tenant_id
       and (old.access_level is distinct from 'read_write'
            or new.access_level = 'read_write') then
      return null;
    end if;
  end if;

  if not public.tenant_holds_agency(old.accessing_tenant_id, old.agency_id, false) then
    delete from public.agency_tenant_access
    where source_tenant_id = old.accessing_tenant_id
      and agency_id = old.agency_id;
  elsif not public.tenant_holds_agency(old.accessing_tenant_id, old.agency_id, true) then
    update public.agency_tenant_access
       set access_level = 'read_only'
     where source_tenant_id = old.accessing_tenant_id
       and agency_id = old.agency_id
       and access_level = 'read_write';
  end if;
  return null;
end;
$$;

revoke all on function public.agency_tenant_access_revoke_downstream() from public, anon, authenticated;

drop trigger if exists agency_tenant_access_revoke_downstream on public.agency_tenant_access;
create trigger agency_tenant_access_revoke_downstream
  after delete or update on public.agency_tenant_access
  for each row execute function public.agency_tenant_access_revoke_downstream();
