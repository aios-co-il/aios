-- Lead arrival source is free text, saved exactly as the sender wrote it
-- (e.g. "FB"), and every arrival that names a source is kept with its date.
--
-- leads.source       latest arrival source (text, was enum lead_source)
-- leads.first_source first arrival source  (text, was enum lead_source)
-- lead_source_events one row per arrival that named a source
--
-- Comparisons (broadcast list rules, origin tags) go through lead_source_key,
-- which maps any text to the old enum's fixed keys, so they match as before.
-- Safe to re-apply.

-- 1. Enum -> text. The origin-tag trigger lists `source` in UPDATE OF, which
--    blocks a type change, so drop and recreate it around the ALTER.
drop trigger if exists trg_sync_lead_origin_tags on public.leads;

alter table public.leads
  alter column source drop default,
  alter column source type text using source::text,
  alter column source set default 'other',
  alter column first_source type text using first_source::text;

create trigger trg_sync_lead_origin_tags
  after insert or update of campaign_name, source on public.leads
  for each row execute function public.trg_sync_lead_origin_tags();

-- 2. Arrival source history.
create table if not exists public.lead_source_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  source text not null,
  campaign_name text,
  received_at timestamptz not null default now()
);

create index if not exists lead_source_events_lead_received_idx
  on public.lead_source_events (lead_id, received_at desc);

alter table public.lead_source_events enable row level security;

-- Readable exactly when the lead is, and only under the lead's own tenant.
-- The EXISTS applies the leads RLS (tenant, role and agency-share rules), which
-- a bare tenant_id = get_user_tenant_id() check would bypass for sales people.
drop policy if exists "Users can view source events of visible leads" on public.lead_source_events;
create policy "Users can view source events of visible leads"
  on public.lead_source_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_source_events.lead_id
        and l.tenant_id = lead_source_events.tenant_id
    )
  );

-- Signed-in users only read; the intake functions write as service_role.
revoke all on public.lead_source_events from public, anon, authenticated;
grant select on public.lead_source_events to authenticated;
grant all on public.lead_source_events to service_role;

-- "other" / empty means no source was given.
create or replace function public.lead_source_is_given(p_source text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(lower(btrim(p_source)), '') not in ('', 'other');
$$;

-- 3. Every new lead with a source gets its first history row, whatever path
--    created it, under the lead's tenant. Repeat arrivals add rows from the
--    intake functions.
create or replace function public.leads_record_first_source_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.lead_source_is_given(new.source) then
    return new;
  end if;
  if new.tenant_id is null then
    raise notice 'leads_record_first_source_event: lead % has no tenant, no history row', new.id;
    return new;
  end if;
  insert into public.lead_source_events (lead_id, tenant_id, source, campaign_name, received_at)
  values (new.id, new.tenant_id, btrim(new.source), new.campaign_name, coalesce(new.created_at, now()));
  return new;
end;
$$;

-- Runs only as the leads trigger; no role calls it directly.
revoke all on function public.leads_record_first_source_event() from public, anon, authenticated;

drop trigger if exists leads_record_first_source_event on public.leads;
create trigger leads_record_first_source_event
  after insert on public.leads
  for each row execute function public.leads_record_first_source_event();

-- 4. Comparisons use the fixed key of a source. The lists below are the ones
--    in supabase/functions/_shared/lead-source/source-key.ts, where
--    inferLeadSource, leadSourceMatches and leadSourceTagName are the TypeScript
--    twins; source-key.test.ts fails when the two differ.

-- Lower case without spaces, `_ - – —` or quote marks (compactLeadSource).
create or replace function public.lead_source_compact(p_source text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select regexp_replace(lower(coalesce(p_source, '')), '[[:space:]_–—''"`״׳-]', '', 'g');
$$;

-- The fixed key of any stored or sent source text, e.g. 'FB' -> 'paid_ads'
-- (inferLeadSource): a whole-value alias first, then the first word rule.
create or replace function public.lead_source_key(p_source text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when src.compact = '' then 'other'
    else coalesce(
      (
        select a.key
        from (values
          ('website', 'website'),
          ('referral', 'referral'),
          ('socialmedia', 'social_media'),
          ('paidads', 'paid_ads'),
          ('coldcall', 'cold_call'),
          ('emailcampaign', 'email_campaign'),
          ('event', 'event'),
          ('whatsapp', 'whatsapp'),
          ('other', 'other'),
          ('site', 'website'),
          ('form', 'website'),
          ('contactform', 'website'),
          ('טופס', 'website'),
          ('recommendation', 'referral'),
          ('social', 'social_media'),
          ('סושיאל', 'social_media'),
          ('fb', 'paid_ads'),
          ('ads', 'paid_ads'),
          ('ממומן', 'paid_ads'),
          ('phone', 'cold_call'),
          ('call', 'cold_call'),
          ('phonecall', 'cold_call'),
          ('דיוור', 'email_campaign'),
          ('webinar', 'event'),
          ('conference', 'event')
        ) as a (alias, key)
        where a.alias = src.compact
      ),
      (
        select w.key
        from (values
          (1, 'website', 'אתר'),
          (1, 'website', 'website'),
          (2, 'cold_call', 'שיחה'),
          (2, 'cold_call', 'טלפון'),
          (2, 'cold_call', 'coldcall'),
          (3, 'referral', 'המלצה'),
          (3, 'referral', 'referral'),
          (3, 'referral', 'הפניה'),
          (4, 'paid_ads', 'facebook'),
          (4, 'paid_ads', 'פייסבוק'),
          (4, 'paid_ads', 'google'),
          (4, 'paid_ads', 'גוגל'),
          (4, 'paid_ads', 'paidads'),
          (4, 'paid_ads', 'ppc'),
          (5, 'social_media', 'instagram'),
          (5, 'social_media', 'אינסטגרם'),
          (5, 'social_media', 'linkedin'),
          (5, 'social_media', 'לינקדאין'),
          (5, 'social_media', 'socialmedia'),
          (5, 'social_media', 'רשתותחברתיות'),
          (5, 'social_media', 'tiktok'),
          (5, 'social_media', 'טיקטוק'),
          (6, 'email_campaign', 'אימייל'),
          (6, 'email_campaign', 'email'),
          (6, 'email_campaign', 'מייל'),
          (6, 'email_campaign', 'newsletter'),
          (7, 'event', 'אירוע'),
          (7, 'event', 'event'),
          (7, 'event', 'כנס'),
          (7, 'event', 'תערוכה'),
          (8, 'whatsapp', 'whatsapp'),
          (8, 'whatsapp', 'ווטסאפ'),
          (8, 'whatsapp', 'וואטסאפ')
        ) as w (rank, key, word)
        where strpos(src.compact, w.word) > 0
        order by w.rank
        limit 1
      ),
      'other'
    )
  end
  from (select public.lead_source_compact(p_source) as compact) as src;
$$;

-- Whether a lead's source matches a configured one (leadSourceMatches): known
-- sources by key, a configured "other" takes any unknown text, and an unknown
-- configured text takes only that same text.
create or replace function public.lead_source_matches(p_wanted text, p_source text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select case
    when public.lead_source_key(p_wanted) <> public.lead_source_key(p_source) then false
    when public.lead_source_key(p_wanted) <> 'other' then true
    else public.lead_source_compact(p_wanted) in ('', 'other', 'אחר')
      or public.lead_source_compact(p_wanted) = public.lead_source_compact(p_source)
  end;
$$;

-- Origin-tag name of a source (leadSourceTagName): the key's label when the
-- source is known, otherwise the text as sent; none for empty or "other".
create or replace function public.lead_source_tag_name(p_source text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case public.lead_source_key(p_source)
    when 'website' then 'אתר'
    when 'referral' then 'הפניה'
    when 'social_media' then 'רשתות חברתיות'
    when 'paid_ads' then 'FB'
    when 'cold_call' then 'שיחה קרה'
    when 'email_campaign' then 'דיוור'
    when 'event' then 'אירוע'
    when 'whatsapp' then 'וואטסאפ'
    else case
      when public.lead_source_compact(p_source) in ('', 'other', 'אחר') then null
      else btrim(p_source)
    end
  end;
$$;

-- Adds a new lead to every enabled lead_created list rule whose statuses and
-- sources it matches. Sources compare with lead_source_matches, so a rule for
-- "facebook" takes a lead sent as "FB"; the rest is unchanged from the baseline.
create or replace function public.broadcast_apply_list_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_statuses jsonb;
  v_sources jsonb;
begin
  for r in
    select * from public.broadcast_list_rules
    where enabled = true and trigger = 'lead_created' and tenant_id = new.tenant_id
  loop
    v_statuses := coalesce(r.filter->'statusKeys', '[]'::jsonb);
    v_sources := coalesce(r.filter->'sources', '[]'::jsonb);
    if jsonb_array_length(v_statuses) > 0 and not (v_statuses ? coalesce(new.status, '')) then
      continue;
    end if;
    if jsonb_array_length(v_sources) > 0 and not exists (
      select 1
      from jsonb_array_elements_text(v_sources) as s (wanted)
      where public.lead_source_matches(s.wanted, new.source)
    ) then
      continue;
    end if;
    insert into public.broadcast_list_members (list_id, tenant_id, entity_type, entity_id, name, phone, email, added_via)
    values (r.list_id, new.tenant_id, 'lead', new.id, coalesce(new.contact_name, new.company_name), new.phone, new.email, 'rule')
    on conflict do nothing;
  end loop;
  return new;
exception when others then
  raise warning 'broadcast_apply_list_rules failed: %', sqlerrm;
  return new;
end;
$$;

-- Runs only as the leads trigger; no role calls it directly.
revoke all on function public.broadcast_apply_list_rules() from public, anon, authenticated;

-- 5. Backfill existing leads: the first source, plus the current one if it
--    changed since, each under the lead's tenant. A lead without a tenant gets
--    no row; the notice counts them.
do $$
declare
  v_without_tenant integer;
begin
  select count(*) into v_without_tenant
  from public.leads l
  where l.tenant_id is null
    and (public.lead_source_is_given(l.first_source) or public.lead_source_is_given(l.source));
  if v_without_tenant > 0 then
    raise notice 'lead_source_history: % leads with a source have no tenant; no history rows for them', v_without_tenant;
  end if;
end;
$$;

insert into public.lead_source_events (lead_id, tenant_id, source, campaign_name, received_at)
select l.id, l.tenant_id, btrim(l.first_source), l.campaign_name,
       coalesce(l.first_created_at, l.created_at, now())
from public.leads l
where l.tenant_id is not null
  and public.lead_source_is_given(l.first_source)
  and not exists (select 1 from public.lead_source_events e where e.lead_id = l.id);

insert into public.lead_source_events (lead_id, tenant_id, source, campaign_name, received_at)
select l.id, l.tenant_id, btrim(l.source), l.campaign_name, coalesce(l.created_at, now())
from public.leads l
where l.tenant_id is not null
  and public.lead_source_is_given(l.source)
  and l.source is distinct from l.first_source
  and not exists (
    select 1 from public.lead_source_events e
    where e.lead_id = l.id and e.source = btrim(l.source)
  );
