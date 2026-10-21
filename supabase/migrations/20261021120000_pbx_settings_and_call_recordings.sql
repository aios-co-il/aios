-- Generic PBX integration (PR #890).
-- 1. pbx_settings: per-tenant PBX config and secrets, readable only by tenant
--    managers (same pattern as maskyoo_settings), so members cannot read the
--    webhook secret or the PBX auth value.
-- 2. call_logs.recording_path + private call-recordings bucket: uploaded call
--    audio is served through signed URLs to members of the owning tenant.
-- 3. phone_match_key + find_phone_owner: exact, index-backed phone matching on
--    the normalized last 9 digits, whatever format the phone was stored in.

create table if not exists public.pbx_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  inbound_secret text not null,
  outbound_auth_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pbx_settings enable row level security;

drop policy if exists "Tenant managers manage pbx_settings" on public.pbx_settings;
create policy "Tenant managers manage pbx_settings" on public.pbx_settings
  using (
    public.is_super_admin(auth.uid())
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.tenant_id = pbx_settings.tenant_id
        and ur.role::text = any (array['owner', 'team_manager'])
    )
  )
  with check (
    public.is_super_admin(auth.uid())
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.tenant_id = pbx_settings.tenant_id
        and ur.role::text = any (array['owner', 'team_manager'])
    )
  );

drop trigger if exists update_pbx_settings_updated_at on public.pbx_settings;
create trigger update_pbx_settings_updated_at
  before update on public.pbx_settings
  for each row execute function public.update_updated_at_column();

grant all on table public.pbx_settings to authenticated, service_role;

alter table public.call_logs add column if not exists recording_path text;

insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

drop policy if exists "Tenant members read call recordings" on storage.objects;
create policy "Tenant members read call recordings" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'call-recordings'
    and (
      public.is_super_admin(auth.uid())
      or exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- Mirrors phoneMatchKey in supabase/functions/_shared/telephony/phone.ts.
create or replace function public.phone_match_key(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when length(n) < 7 then null else right(n, 9) end
  from (
    select case
      when d like '972%' then '0' || substr(d, 4)
      when length(d) = 9 and d not like '0%' then '0' || d
      else d
    end as n
    from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) digits
  ) normalized
$$;

create index if not exists idx_leads_tenant_phone_match_key
  on public.leads (tenant_id, public.phone_match_key(phone));
create index if not exists idx_clients_tenant_phone_match_key
  on public.clients (tenant_id, public.phone_match_key(phone));

-- Newest lead with this phone, and newest client, in one round trip.
create or replace function public.find_phone_owner(p_tenant_id uuid, p_match_key text)
returns table (lead_id uuid, client_id uuid)
language sql
stable
set search_path = ''
as $$
  select
    (select l.id from public.leads l
      where l.tenant_id = p_tenant_id
        and public.phone_match_key(l.phone) = p_match_key
      order by l.created_at desc limit 1),
    (select c.id from public.clients c
      where c.tenant_id = p_tenant_id
        and public.phone_match_key(c.phone) = p_match_key
      order by c.created_at desc limit 1)
$$;

revoke all on function public.find_phone_owner(uuid, text) from public, anon, authenticated;
grant execute on function public.find_phone_owner(uuid, text) to service_role;
