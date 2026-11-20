-- Custom domains for landing sites (AIO-607): a client's site can be served on its own hostname
-- (for example lp.exsitu.co.il) besides <subdomain>.aios.co.il. A person sets it in the landing
-- project's settings panel; the landing-domain edge function attaches it to the landing-pages
-- Vercel project and records whether Vercel verified it, and Carmen's landing build writes it into
-- the site's site.json as "domains". The hostname format matches
-- supabase/functions/_shared/workshop/landing/site-domain.ts, which the panel checks with.

-- custom_domain: the hostname the person set. A domain is global, so it is unique across every
-- org (like subdomain), not per tenant: Vercel attaches one hostname to one site.
-- custom_domain_verified_at: when landing-domain last found the domain verified and configured in
-- Vercel; null while it is not. The build reads it to pick the page's public address.
-- vercel_domain: the hostname landing-domain attached to the Vercel project, so a changed or
-- removed domain can be detached there.
alter table public.landing_sites
  add column custom_domain text
    constraint landing_sites_custom_domain_format check (
      char_length(custom_domain) <= 253
      and custom_domain ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$'
    )
    constraint landing_sites_custom_domain_not_aios check (
      custom_domain <> 'aios.co.il' and custom_domain not like '%.aios.co.il'
    ),
  add column custom_domain_verified_at timestamptz,
  add column vercel_domain text;

create unique index landing_sites_custom_domain_key
  on public.landing_sites (lower(custom_domain))
  where custom_domain is not null;

-- Resolves the site a landing project's settings apply to, as a member of the project's org: the
-- site of the project's page (where the build reads the site's settings), or the client's site for
-- a project without a page yet. Refuses a page on another client's site, and a site that does not
-- exist yet (the project's first settings save creates it). Returns the site and its org.
create or replace function public.landing_site_of_project(p_item_id uuid)
returns table (site_id uuid, tenant_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.marketing_work_items%rowtype;
  v_site_id uuid;
  v_site_client uuid;
begin
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if v_item.id is null or not exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = v_item.tenant_id and tu.user_id = (select auth.uid())
  ) then
    raise exception 'הפרויקט לא נמצא בחשבון הזה, או שאין לך גישה אליו' using errcode = '42501';
  end if;
  if coalesce(v_item.payload->>'project_type', '') <> 'landing' then
    raise exception 'הפרויקט הזה אינו עמוד נחיתה' using errcode = '22023';
  end if;
  if v_item.client_id is null then
    raise exception 'צריך לשייך את הפרויקט ללקוח לפני שמגדירים עמוד נחיתה' using errcode = '22023';
  end if;

  select s.id, s.client_id into v_site_id, v_site_client
    from public.landing_pages p
    join public.landing_sites s on s.id = p.site_id and s.tenant_id = p.tenant_id
   where p.tenant_id = v_item.tenant_id and p.work_item_id = v_item.id;
  if v_site_id is null then
    select s.id, s.client_id into v_site_id, v_site_client from public.landing_sites s
     where s.tenant_id = v_item.tenant_id and s.client_id = v_item.client_id;
  end if;
  if v_site_id is not null and v_site_client <> v_item.client_id then
    raise exception 'העמוד של הפרויקט נמצא באתר של לקוח אחר. צריך להחזיר את הפרויקט ללקוח של העמוד לפני ששומרים את הגדרות האתר'
      using errcode = '22023';
  end if;
  if v_site_id is null then
    raise exception 'צריך לשמור קודם את כתובת האתר' using errcode = '22023';
  end if;
  return query select v_site_id, v_item.tenant_id;
end;
$$;

revoke all on function public.landing_site_of_project(uuid) from public, anon, authenticated;
grant execute on function public.landing_site_of_project(uuid) to authenticated, service_role;

-- Saves the tracking ids of a landing project's site (unchanged behaviour; the site and the
-- access checks now come from landing_site_of_project, shared with the domain save).
create or replace function public.landing_site_save_tracking(
  p_item_id uuid,
  p_gtm_id text,
  p_ga4_id text,
  p_meta_pixel_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site record;
  v_constraint text;
begin
  select * into v_site from public.landing_site_of_project(p_item_id);
  begin
    update public.landing_sites
       set gtm_id = nullif(btrim(coalesce(p_gtm_id, '')), ''),
           ga4_id = nullif(btrim(coalesce(p_ga4_id, '')), ''),
           meta_pixel_id = nullif(btrim(coalesce(p_meta_pixel_id, '')), '')
     where id = v_site.site_id and tenant_id = v_site.tenant_id;
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception '%', case v_constraint
          when 'landing_sites_gtm_id_format' then 'מזהה Google Tag Manager לא תקין (למשל GTM-ABC123)'
          when 'landing_sites_ga4_id_format' then 'מזהה GA4 לא תקין (למשל G-ABC123XYZ)'
          when 'landing_sites_meta_pixel_id_format' then 'מזהה הפיקסל של Meta לא תקין: 10 עד 20 ספרות'
          else 'קוד מעקב לא תקין'
        end
        using errcode = '22023';
  end;
end;
$$;

revoke all on function public.landing_site_save_tracking(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.landing_site_save_tracking(uuid, text, text, text)
  to authenticated, service_role;

-- Saves the custom domain of a landing project's site as a member of its org; an empty value
-- clears it. The hostname is stored trimmed and lowercased. A changed domain is no longer
-- verified until landing-domain checks it in Vercel again.
create or replace function public.landing_site_save_domain(p_item_id uuid, p_domain text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site record;
  v_domain text := nullif(lower(btrim(coalesce(p_domain, ''))), '');
  v_constraint text;
begin
  select * into v_site from public.landing_site_of_project(p_item_id);
  begin
    update public.landing_sites
       set custom_domain = v_domain,
           custom_domain_verified_at = case
             when custom_domain is not distinct from v_domain then custom_domain_verified_at
           end
     where id = v_site.site_id and tenant_id = v_site.tenant_id;
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception '%', case v_constraint
          when 'landing_sites_custom_domain_not_aios'
            then 'כתובות של aios.co.il ניתנות דרך תת־הדומיין של האתר. כאן מזינים דומיין של הלקוח'
          else 'הדומיין לא תקין: רק שם מארח, למשל lp.example.co.il, בלי https://, נתיב או פורט'
        end
        using errcode = '22023';
    when unique_violation then
      raise exception 'הדומיין % כבר משמש אתר אחר', v_domain using errcode = '23505';
  end;
end;
$$;

revoke all on function public.landing_site_save_domain(uuid, text) from public, anon, authenticated;
grant execute on function public.landing_site_save_domain(uuid, text) to authenticated, service_role;
