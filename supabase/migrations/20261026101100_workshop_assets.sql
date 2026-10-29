-- The assets of a workshop project: pictures, files, links, briefs and the client's website. They are
-- inputs Carmen and the user draw on, not board pages. Assets marked use_as_reference are mirrored
-- into the project's reference list (payload.asset_references) so every picture follows them.

create table if not exists public.workshop_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.marketing_work_items(id) on delete cascade,
  asset_type text not null check (asset_type in ('image', 'video', 'file', 'link', 'site', 'text')),
  source text not null default 'user' check (source in ('user', 'client', 'carmen', 'site')),
  title text not null default '',
  url text,
  storage_path text,
  text text,
  use_as_reference boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workshop_assets_item_created_idx
  on public.workshop_assets (item_id, created_at);
create index if not exists workshop_assets_tenant_idx
  on public.workshop_assets (tenant_id);

alter table public.workshop_assets enable row level security;

grant select, insert, update, delete on public.workshop_assets to authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_assets' and policyname = 'workshop_assets_select') then
    create policy workshop_assets_select on public.workshop_assets for select to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())) or public.is_super_admin((select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_assets' and policyname = 'workshop_assets_insert') then
    create policy workshop_assets_insert on public.workshop_assets for insert to authenticated
      with check (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_assets' and policyname = 'workshop_assets_update') then
    create policy workshop_assets_update on public.workshop_assets for update to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())))
      with check (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_assets' and policyname = 'workshop_assets_delete') then
    create policy workshop_assets_delete on public.workshop_assets for delete to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())));
  end if;
end $$;

create or replace trigger workshop_assets_updated_at
  before update on public.workshop_assets
  for each row execute function public.update_updated_at_column();

-- Keeps an asset inside its project's tenant.
create or replace function public.workshop_assets_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.marketing_work_items where id = new.item_id;
  if v_tenant is null or v_tenant <> new.tenant_id then
    raise exception 'workshop_assets: work item % is not in tenant %', new.item_id, new.tenant_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger workshop_assets_guard
  before insert or update of item_id, tenant_id on public.workshop_assets
  for each row execute function public.workshop_assets_guard();

-- Mirrors the project's reference pictures into its payload. Only https pictures count; the cap of
-- four the generators apply is applied on read, so this keeps the newest first.
create or replace function public.workshop_assets_sync_references()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid := coalesce(new.item_id, old.item_id);
  v_urls jsonb;
begin
  select coalesce(jsonb_agg(a.url order by a.created_at desc), '[]'::jsonb)
    into v_urls
    from (
      select distinct on (url) url, created_at
        from public.workshop_assets
       where item_id = v_item
         and asset_type = 'image'
         and use_as_reference
         and url ~* '^https://\S+$'
       order by url, created_at desc
    ) a;

  update public.marketing_work_items
     set payload = case
       when jsonb_array_length(v_urls) = 0 then coalesce(payload, '{}'::jsonb) - 'asset_references'
       else jsonb_set(coalesce(payload, '{}'::jsonb), '{asset_references}', v_urls, true)
     end
   where id = v_item
     and (coalesce(payload, '{}'::jsonb) -> 'asset_references') is distinct from
         case when jsonb_array_length(v_urls) = 0 then null else v_urls end;
  return null;
end;
$$;

create or replace trigger workshop_assets_sync_references
  after insert or delete or update of url, use_as_reference, asset_type on public.workshop_assets
  for each row execute function public.workshop_assets_sync_references();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workshop_assets'
    ) then
    alter publication supabase_realtime add table public.workshop_assets;
  end if;
end $$;

-- Carmen can look at a client's site and add assets; the skin learns the tools and when to use them.
UPDATE public.ai_skills
SET
  allowed_tools = allowed_tools || ARRAY['workshop_inspect_site', 'workshop_add_assets']::text[],
  system_prompt = system_prompt || E'\n- לפרויקט יש לשונית נכסים: בריף הלקוח, האתר שלו, קבצים, קישורים ורפרנסים. workshop_get_state מחזיר אותם ב-assets וב-client. כשיש לפרויקט אתר (נכס מסוג site או client.website) והמשתמש מבקש קופי, סגנון או תמונות במותג של הלקוח, קראי קודם ל-workshop_inspect_site: היא קוראת את האתר ומחזירה צבעים, גופנים, סגנון כתיבה ותמונות. הציעי למשתמש להשתמש בצבעים ובתמונות שמצאת, ושמרי תמונות מהאתר עם workshop_add_assets (use_as_reference=true לתמונות שמגדירות את הסגנון). אל תנחשי איך האתר נראה בלי לקרוא אותו.'
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND NOT ('workshop_inspect_site' = ANY (allowed_tools));
