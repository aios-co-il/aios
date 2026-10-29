-- AIO-234: block cross-tenant publishing to PBN sites and client reports.
-- publishing_articles RLS checks only the article's own tenant_id, and site_id
-- and client_id are just foreign keys. So a member of any tenant could insert
-- a published article that points at another tenant's site (publishing-feed
-- serves articles by site_id, so it would appear on that tenant's public
-- magazine) or at another tenant's client (sync_published_article_to_seo_
-- monthly_work then writes the article and its live link into that client's
-- monthly SEO report). Every app flow picks the site and the client from its
-- own tenant (PublishingStudio loads both with .eq("tenant_id", tenantId),
-- Carmen's PBN skin, generate-publishing-articles), so require it here.
-- SECURITY DEFINER so the check sees publishing_sites and clients whatever the
-- caller's RLS.
create or replace function public.publishing_articles_enforce_site_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_tenant_id uuid;
  v_client_tenant_id uuid;
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
    select c.tenant_id
      into v_client_tenant_id
    from public.clients c
    where c.id = new.client_id;

    -- A missing client is left to the foreign key.
    if found and v_client_tenant_id is distinct from new.tenant_id then
      raise exception 'publishing article client belongs to another tenant'
        using errcode = '42501',
              hint = 'client_id must reference a clients row of the article''s tenant';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.publishing_articles_enforce_site_tenant() from public, anon, authenticated;

drop trigger if exists publishing_articles_enforce_site_tenant on public.publishing_articles;
create trigger publishing_articles_enforce_site_tenant
  before insert or update of site_id, tenant_id, client_id on public.publishing_articles
  for each row execute function public.publishing_articles_enforce_site_tenant();
