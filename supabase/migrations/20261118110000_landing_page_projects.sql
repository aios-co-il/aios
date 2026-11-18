-- Landing pages as Workshop projects (AIO-605): a landing page belongs to one Workshop project of
-- its client, and org members set its address and lead destination through one function, which
-- is the only way a webhook URL is written.

alter table public.landing_pages
  add column work_item_id uuid references public.marketing_work_items(id) on delete set null;

-- One page per project.
create unique index landing_pages_work_item_key
  on public.landing_pages (tenant_id, work_item_id)
  where work_item_id is not null;

-- Saves a landing project's settings as a member of its org: creates the client's site and the
-- project's page on first save, then sets where the page's leads go. A site's subdomain and a
-- page's address are fixed once created, because live links point at them. The webhook URL is
-- stored when given, kept when omitted, and deleted when the webhook destination is turned off.
create or replace function public.landing_page_save_settings(
  p_item_id uuid,
  p_subdomain text,
  p_slug text,
  p_lead_to_crm boolean,
  p_lead_to_webhook boolean,
  p_webhook_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.marketing_work_items%rowtype;
  v_site public.landing_sites%rowtype;
  v_page public.landing_pages%rowtype;
  v_subdomain text := lower(btrim(coalesce(p_subdomain, '')));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_url text := nullif(btrim(coalesce(p_webhook_url, '')), '');
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
  if v_url is not null and v_url !~ '^https://[^[:space:]]+$' then
    raise exception 'כתובת הוובהוק חייבת להתחיל ב-https://' using errcode = '22023';
  end if;

  select * into v_site from public.landing_sites
   where tenant_id = v_item.tenant_id and client_id = v_item.client_id;
  if v_site.id is null then
    begin
      insert into public.landing_sites (tenant_id, client_id, subdomain)
      values (v_item.tenant_id, v_item.client_id, v_subdomain)
      returning * into v_site;
    exception
      when unique_violation then
        raise exception 'תת־הדומיין % כבר תפוס', v_subdomain using errcode = '23505';
      when check_violation then
        raise exception 'תת־דומיין לא תקין: אותיות קטנות באנגלית, ספרות ומקפים בלבד' using errcode = '22023';
    end;
  elsif v_site.subdomain <> v_subdomain then
    raise exception 'ללקוח כבר יש אתר בכתובת %, ואי אפשר לשנות אותה', v_site.subdomain using errcode = '22023';
  end if;

  select * into v_page from public.landing_pages
   where tenant_id = v_item.tenant_id and work_item_id = v_item.id;
  if v_page.id is null then
    begin
      insert into public.landing_pages (tenant_id, site_id, slug, title, work_item_id)
      values (
        v_item.tenant_id, v_site.id, v_slug,
        coalesce(nullif(btrim(v_item.title), ''), v_slug), v_item.id
      )
      returning * into v_page;
    exception
      when unique_violation then
        raise exception 'לאתר כבר יש עמוד בכתובת %', v_slug using errcode = '23505';
      when check_violation then
        raise exception 'כתובת עמוד לא תקינה: אותיות קטנות באנגלית, ספרות ומקפים בלבד' using errcode = '22023';
    end;
  elsif v_page.slug <> v_slug then
    raise exception 'העמוד כבר קיים בכתובת %, ואי אפשר לשנות אותה', v_page.slug using errcode = '22023';
  end if;

  if coalesce(p_lead_to_webhook, false) then
    if v_url is not null then
      insert into public.landing_page_webhooks (page_id, tenant_id, url)
      values (v_page.id, v_item.tenant_id, v_url)
      on conflict (page_id) do update set url = excluded.url;
    elsif not exists (
      select 1 from public.landing_page_webhooks where page_id = v_page.id and tenant_id = v_item.tenant_id
    ) then
      raise exception 'צריך להזין כתובת וובהוק' using errcode = '22023';
    end if;
  else
    delete from public.landing_page_webhooks where page_id = v_page.id and tenant_id = v_item.tenant_id;
  end if;

  update public.landing_pages
     set lead_to_crm = coalesce(p_lead_to_crm, false),
         lead_to_webhook = coalesce(p_lead_to_webhook, false)
   where id = v_page.id and tenant_id = v_item.tenant_id;

  return v_page.id;
end;
$$;

revoke all on function public.landing_page_save_settings(uuid, text, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.landing_page_save_settings(uuid, text, text, boolean, boolean, text)
  to authenticated, service_role;

-- The three live Exsitu pages become Workshop projects of the Exsitu client, with their site and
-- pages. Their lead destination stays off here: the webhook URL is a credential and is entered in
-- the settings panel. Runs only where that client exists (Production); elsewhere it does nothing.
do $$
declare
  v_tenant constant uuid := '2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019';
  v_client constant uuid := 'd2c33a17-6f5d-4f2e-bee7-026e498ee213';
  v_site uuid;
begin
  if not exists (select 1 from public.clients where id = v_client and tenant_id = v_tenant) then
    raise notice 'landing_page_projects: Exsitu client not found here, nothing to backfill';
    return;
  end if;

  insert into public.landing_sites (tenant_id, client_id, subdomain)
  values (v_tenant, v_client, 'exsitu')
  on conflict (tenant_id, client_id) do nothing;
  select id into v_site from public.landing_sites where tenant_id = v_tenant and client_id = v_client;

  with pages (slug, title) as (
    values
      ('home', 'יש לכם ספק מחשוב. יש לכם גם מי שאחראי?'),
      ('cyber', 'איומים דיגיטליים לא תמיד נראים כמו איומים'),
      ('cloud', 'ענן פרטי מנוהל מול ענן ציבורי')
  ),
  missing as (
    select p.slug, p.title, gen_random_uuid() as item_id
      from pages p
     where not exists (
       select 1 from public.landing_pages lp
        where lp.tenant_id = v_tenant and lp.site_id = v_site and lp.slug = p.slug
     )
  ),
  items as (
    insert into public.marketing_work_items (id, tenant_id, client_id, title, status, target_channel, payload)
    select m.item_id, v_tenant, v_client, m.title, 'published', 'landing',
           jsonb_build_object('project_type', 'landing', 'department', 'web', 'intake_source', 'backfill')
      from missing m
    returning id
  )
  insert into public.landing_pages (tenant_id, site_id, slug, title, work_item_id)
  select v_tenant, v_site, m.slug, m.title, m.item_id
    from missing m
   where exists (select 1 from items);
end;
$$;
