-- Landing pages in AIOS (AIO-604): a client's site (its subdomain on aios.co.il), its pages, and
-- where each page's leads go: the org's CRM, a webhook, or both. The landing-pages app posts every
-- lead to the landing-lead-intake function, which reads these rows. Page content stays in the
-- landing-pages repo; these tables hold only what AIOS decides.

-- A client's landing site. The subdomain is a public hostname, so it is unique across orgs.
create table public.landing_sites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  subdomain text not null unique
    check (subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
      and subdomain not in ('www', 'staging', 'app', 'api', 'admin', 'mail')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_id),
  unique (id, tenant_id)
);

-- One page of a site. The composite key keeps a page inside its site's org.
create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$'),
  title text not null check (btrim(title) <> ''),
  lead_to_crm boolean not null default false,
  lead_to_webhook boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (site_id, tenant_id) references public.landing_sites(id, tenant_id) on delete cascade,
  unique (tenant_id, site_id, slug),
  unique (id, tenant_id)
);

-- A page's lead webhook URL. The URL is a credential (anyone holding it can post to it), so it
-- lives apart from landing_pages and no role but service_role can read it.
create table public.landing_page_webhooks (
  page_id uuid primary key,
  tenant_id uuid not null,
  url text not null check (url ~ '^https://[^[:space:]]+$'),
  updated_at timestamptz not null default now(),
  foreign key (page_id, tenant_id) references public.landing_pages(id, tenant_id) on delete cascade
);

-- Every lead a landing page received and what happened at each destination, so a failed delivery
-- is visible and the lead is not lost.
create table public.landing_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  page_id uuid not null,
  name text not null,
  phone text not null,
  email text,
  crm_status text not null default 'skipped' check (crm_status in ('skipped', 'sent', 'failed')),
  webhook_status text not null default 'skipped' check (webhook_status in ('skipped', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  foreign key (page_id, tenant_id) references public.landing_pages(id, tenant_id) on delete cascade
);

create index landing_pages_site_idx on public.landing_pages (site_id);
create index landing_leads_page_created_idx on public.landing_leads (page_id, created_at desc);
create index landing_leads_tenant_idx on public.landing_leads (tenant_id);

create trigger landing_sites_updated_at
  before update on public.landing_sites
  for each row execute function public.update_updated_at_column();

create trigger landing_pages_updated_at
  before update on public.landing_pages
  for each row execute function public.update_updated_at_column();

create trigger landing_page_webhooks_updated_at
  before update on public.landing_page_webhooks
  for each row execute function public.update_updated_at_column();

-- Keeps a site's client inside the site's org.
create or replace function public.landing_sites_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.clients c where c.id = new.client_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'landing_sites: client % is not in tenant %', new.client_id, new.tenant_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.landing_sites_guard() from public, anon, authenticated;

create trigger landing_sites_guard
  before insert or update of client_id, tenant_id on public.landing_sites
  for each row execute function public.landing_sites_guard();

alter table public.landing_sites enable row level security;
alter table public.landing_pages enable row level security;
alter table public.landing_page_webhooks enable row level security;
alter table public.landing_leads enable row level security;

revoke all on public.landing_sites, public.landing_pages, public.landing_page_webhooks, public.landing_leads
  from anon, authenticated;
grant select on public.landing_sites, public.landing_pages, public.landing_leads to authenticated;
grant all on public.landing_sites, public.landing_pages, public.landing_page_webhooks, public.landing_leads
  to service_role;

-- Org members read their org's sites.
create policy landing_sites_select on public.landing_sites for select to authenticated
  using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid()))
    or public.is_super_admin((select auth.uid())));

-- Org members read their org's pages.
create policy landing_pages_select on public.landing_pages for select to authenticated
  using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid()))
    or public.is_super_admin((select auth.uid())));

-- Org members read the leads their org's pages received.
create policy landing_leads_select on public.landing_leads for select to authenticated
  using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid()))
    or public.is_super_admin((select auth.uid())));

-- landing_page_webhooks has no policy on purpose: only service_role reads or writes a webhook URL.
