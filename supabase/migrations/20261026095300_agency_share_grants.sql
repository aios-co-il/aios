-- AIO-234 review fixes, Decision A (David, 27 Oct): an owner may share an agency
-- their tenant owns or that is shared with their tenant, and no other.
--
-- 1. Writes to agency_tenant_access. The baseline policy "Owners can manage
--    their tenant agency access" let an owner of either side write any row for
--    any agency, so the owner of tenant X could insert (source X, another
--    tenant's agency, accessing X); the article client check in 20261026095100
--    then accepted that agency's clients, and
--    sync_published_article_to_seo_monthly_work wrote into their monthly SEO
--    reports. Now only an owner of source_tenant_id inserts, updates or deletes
--    a row, and only for an agency source_tenant_id holds. A read_write row
--    needs a read_write hold, so a read_only share cannot be passed on as
--    read_write. Reads and the super admin policy are unchanged.
--
-- tenant_holds_agency: the agency's own tenant holds it, and so does every
-- tenant reached from it through agency_tenant_access rows (with _need_write,
-- through read_write rows only). A row whose source never held the agency
-- grants nothing. SECURITY DEFINER so the policies on agency_tenant_access can
-- read the table without recursing into its own RLS. agency_tenant_access has
-- no expiry or active column, so there is none to honour.
create or replace function public.tenant_holds_agency(
  _tenant_id uuid,
  _agency_id uuid,
  _need_write boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive holders(tenant_id) as (
    select a.tenant_id from public.agencies a where a.id = _agency_id
    union
    select ata.accessing_tenant_id
    from public.agency_tenant_access ata
    join holders h on h.tenant_id = ata.source_tenant_id
    where ata.agency_id = _agency_id
      and (not _need_write or ata.access_level = 'read_write')
  )
  select exists (select 1 from holders h where h.tenant_id = _tenant_id);
$$;

revoke all on function public.tenant_holds_agency(uuid, uuid, boolean) from public, anon;
grant execute on function public.tenant_holds_agency(uuid, uuid, boolean) to authenticated, service_role;

drop policy if exists "Owners can manage their tenant agency access" on public.agency_tenant_access;
drop policy if exists "Owners can share agencies their tenant holds" on public.agency_tenant_access;
drop policy if exists "Owners can update their tenant's agency shares" on public.agency_tenant_access;
drop policy if exists "Owners can delete their tenant's agency shares" on public.agency_tenant_access;

create policy "Owners can share agencies their tenant holds"
  on public.agency_tenant_access
  for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    and source_tenant_id = public.get_user_tenant_id(auth.uid())
    and public.tenant_holds_agency(
      source_tenant_id, agency_id, coalesce(access_level = 'read_write', false))
  );

create policy "Owners can update their tenant's agency shares"
  on public.agency_tenant_access
  for update to authenticated
  using (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    and source_tenant_id = public.get_user_tenant_id(auth.uid())
  )
  with check (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    and source_tenant_id = public.get_user_tenant_id(auth.uid())
    and public.tenant_holds_agency(
      source_tenant_id, agency_id, coalesce(access_level = 'read_write', false))
  );

create policy "Owners can delete their tenant's agency shares"
  on public.agency_tenant_access
  for delete to authenticated
  using (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    and source_tenant_id = public.get_user_tenant_id(auth.uid())
  );

-- 2. The article client check (20261026095100) accepted any agency_tenant_access
--    row for the client's agency and the article's tenant: a read_only share,
--    or a row an owner wrote for an agency their tenant never held. Now the
--    article's tenant must hold the client's agency with read_write access
--    (tenant_holds_agency). The site must still be the article tenant's own.
create or replace function public.publishing_articles_enforce_site_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_tenant_id uuid;
  v_client_tenant_id uuid;
  v_client_agency_id uuid;
begin
  if new.site_id is not null then
    select ps.tenant_id
      into v_site_tenant_id
    from public.publishing_sites ps
    where ps.id = new.site_id;

    -- A missing site is left to the foreign key.
    if found and v_site_tenant_id is distinct from new.tenant_id then
      raise exception 'publishing article site belongs to another tenant'
        using errcode = '42501',
              hint = 'site_id must reference a publishing_sites row of the article''s tenant';
    end if;
  end if;

  if new.client_id is not null then
    select c.tenant_id, c.agency_id
      into v_client_tenant_id, v_client_agency_id
    from public.clients c
    where c.id = new.client_id;

    -- A missing client is left to the foreign key.
    if found
       and v_client_tenant_id is distinct from new.tenant_id
       and not public.tenant_holds_agency(new.tenant_id, v_client_agency_id, true) then
      raise exception 'publishing article client belongs to another tenant'
        using errcode = '42501',
              hint = 'client_id must reference a client of the article''s tenant or of an agency shared with it read_write';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.publishing_articles_enforce_site_tenant() from public, anon, authenticated;

-- 3. 20261026095200 shared DMM-MC "both ways", but DMM owns DMM-MC, so its
--    (source MarketingCaptain, accessing DMM) row only gave DMM its own agency
--    and named MarketingCaptain as the source. Remove the rows that migration
--    added that give a tenant its own agency. Older rows are left alone.
delete from public.agency_tenant_access ata
using public.agencies a
where a.id = ata.agency_id
  and a.tenant_id = ata.accessing_tenant_id
  and ata.notes like 'Added by the AIO-234 merge of tavnicol.co.il%';
