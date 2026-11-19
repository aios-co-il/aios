-- Tracking ids for landing sites (AIO-607): a client's site carries its Google Tag Manager, GA4
-- and Meta Pixel ids, set in the landing project's settings panel. Carmen's landing build writes
-- them into the site's site.json in aios-co-il/landing-pages, whose app loads the tags on the
-- site's published pages in Production only. The formats match that app's schema
-- (src/lib/site-meta.ts).

-- "if not exists": this PR's preview database applied the migration once under an earlier version
-- number, and the rerun under this one must not fail there. Staging and Production see it once.
alter table public.landing_sites
  add column if not exists gtm_id text
    constraint landing_sites_gtm_id_format check (gtm_id ~ '^GTM-[A-Z0-9]{4,12}$'),
  add column if not exists ga4_id text
    constraint landing_sites_ga4_id_format check (ga4_id ~ '^G-[A-Z0-9]{6,14}$'),
  add column if not exists meta_pixel_id text
    constraint landing_sites_meta_pixel_id_format check (meta_pixel_id ~ '^[0-9]{10,20}$');

-- Saves the tracking ids of a landing project's site as a member of its org. The ids apply to
-- every page of the client's site; an empty id clears it. The site is the one the project's page
-- lives on, which is where the build reads the ids from; a project without a page yet uses its
-- client's site. The site must exist: the project's first settings save creates it.
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
  v_item public.marketing_work_items%rowtype;
  v_site_id uuid;
  v_site_client uuid;
  v_constraint text;
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
    select id, client_id into v_site_id, v_site_client from public.landing_sites
     where tenant_id = v_item.tenant_id and client_id = v_item.client_id;
  end if;
  if v_site_id is not null and v_site_client <> v_item.client_id then
    raise exception 'העמוד של הפרויקט נמצא באתר של לקוח אחר. צריך להחזיר את הפרויקט ללקוח של העמוד לפני ששומרים קודי מעקב'
      using errcode = '22023';
  end if;
  if v_site_id is null then
    raise exception 'צריך לשמור קודם את כתובת האתר' using errcode = '22023';
  end if;

  begin
    update public.landing_sites
       set gtm_id = nullif(btrim(coalesce(p_gtm_id, '')), ''),
           ga4_id = nullif(btrim(coalesce(p_ga4_id, '')), ''),
           meta_pixel_id = nullif(btrim(coalesce(p_meta_pixel_id, '')), '')
     where id = v_site_id and tenant_id = v_item.tenant_id;
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

-- The live Exsitu site already loads its Tag Manager container from site.json; AIOS now holds the
-- same id, so the next build leaves site.json as it is. Runs only where that site exists
-- (Production); elsewhere it does nothing.
do $$
begin
  update public.landing_sites
     set gtm_id = 'GTM-NVKZTXH3'
   where subdomain = 'exsitu'
     and tenant_id = '2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019'
     and client_id = 'd2c33a17-6f5d-4f2e-bee7-026e498ee213'
     and gtm_id is null;
  if not found then
    raise notice 'landing_site_tracking: no exsitu site without a Tag Manager id here, nothing to backfill';
  end if;
end;
$$;
