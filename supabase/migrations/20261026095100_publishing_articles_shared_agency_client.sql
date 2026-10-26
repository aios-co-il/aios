-- AIO-234 follow-up: a PBN article may name a client of another tenant when that
-- client's agency is shared with the article's tenant (agency_tenant_access),
-- the same rule user_can_access_client applies to people. On Staging, 178 of
-- the 185 articles whose client is in another tenant are such shared-agency
-- clients (MarketingCaptain writing for DMM's agencies), so the strict
-- same-tenant check in 20261026095000 would refuse real work. The site must
-- still belong to the article's own tenant.
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
       and not exists (
         select 1
         from public.agency_tenant_access ata
         where ata.agency_id = v_client_agency_id
           and ata.accessing_tenant_id = new.tenant_id
       ) then
      raise exception 'publishing article client belongs to another tenant'
        using errcode = '42501',
              hint = 'client_id must reference a client of the article''s tenant or of an agency shared with it';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.publishing_articles_enforce_site_tenant() from public, anon, authenticated;
