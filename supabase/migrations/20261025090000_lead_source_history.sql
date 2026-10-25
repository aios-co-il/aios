-- Lead arrival source is free text, saved exactly as the sender wrote it
-- (e.g. "FB"), and every arrival that names a source is kept with its date.
--
-- leads.source       latest arrival source (text, was enum lead_source)
-- leads.first_source first arrival source  (text, was enum lead_source)
-- lead_source_events one row per arrival that named a source

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
  tenant_id uuid references public.tenants (id) on delete cascade,
  source text not null,
  campaign_name text,
  received_at timestamptz not null default now()
);

create index if not exists lead_source_events_lead_received_idx
  on public.lead_source_events (lead_id, received_at desc);

alter table public.lead_source_events enable row level security;

-- Visible to whoever can see the lead (the leads RLS applies inside EXISTS).
create policy "Users can view source events of visible leads"
  on public.lead_source_events
  for select
  to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

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
--    created it. Repeat arrivals add rows from the intake functions.
create or replace function public.leads_record_first_source_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.lead_source_is_given(new.source) then
    insert into public.lead_source_events (lead_id, tenant_id, source, campaign_name, received_at)
    values (new.id, new.tenant_id, btrim(new.source), new.campaign_name, coalesce(new.created_at, now()));
  end if;
  return new;
end;
$$;

drop trigger if exists leads_record_first_source_event on public.leads;
create trigger leads_record_first_source_event
  after insert on public.leads
  for each row execute function public.leads_record_first_source_event();

-- 4. Backfill existing leads: the first source, plus the current one if it
--    changed since.
insert into public.lead_source_events (lead_id, tenant_id, source, campaign_name, received_at)
select l.id, l.tenant_id, btrim(l.first_source), l.campaign_name,
       coalesce(l.first_created_at, l.created_at, now())
from public.leads l
where public.lead_source_is_given(l.first_source)
  and not exists (select 1 from public.lead_source_events e where e.lead_id = l.id);

insert into public.lead_source_events (lead_id, tenant_id, source, campaign_name, received_at)
select l.id, l.tenant_id, btrim(l.source), l.campaign_name, coalesce(l.created_at, now())
from public.leads l
where public.lead_source_is_given(l.source)
  and l.source is distinct from l.first_source
  and not exists (
    select 1 from public.lead_source_events e
    where e.lead_id = l.id and e.source = btrim(l.source)
  );
