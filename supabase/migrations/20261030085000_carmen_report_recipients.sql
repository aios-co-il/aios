-- AIO-260: whom each organization's Carmen reports to.
--
-- One row per recipient: a staff member of the organization (user_id; the
-- phone comes from their campaigner card, else their profile) or an extra
-- E.164 phone with a label. The Sunday digests, the owner slot of instant
-- pulse alerts and the notify fallback read this list through
-- supabase/functions/_shared/carmen-report-recipients/. An empty list means
-- the organization's owners. Clients are never recipients: the guard refuses
-- a client's phone on write, and carmen_report_client_phones lets each send
-- skip one that became a client's later and the settings screen flag it.
--
-- tenant_heartbeat_settings.campaign_pulse_phone is carried into the list once
-- and stays readable (never cleared here); nothing reads it any more.
-- Removing the column is AIO-276.

create table if not exists public.carmen_report_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  phone text,
  label text,
  created_at timestamptz not null default now(),
  constraint carmen_report_recipients_one_target_chk
    check ((user_id is null) <> (phone is null)),
  -- 9 to 15 digits: the phones dialablePhone
  -- (_shared/carmen-report-recipients/candidates.ts) sends to.
  constraint carmen_report_recipients_phone_e164_chk
    check (phone ~ '^\+[1-9][0-9]{8,14}$'),
  constraint carmen_report_recipients_phone_label_chk
    check (phone is null or coalesce(length(btrim(label)), 0) between 1 and 80),
  constraint carmen_report_recipients_tenant_user_key unique (tenant_id, user_id),
  constraint carmen_report_recipients_tenant_phone_key unique (tenant_id, phone)
);

comment on table public.carmen_report_recipients is
  'Whom the organization''s Carmen reports to (AIO-260): staff members (user_id) or extra E.164 phones with a label. Empty = the organization''s owners.';

-- True when the signed-in user is an owner or agency owner of the organization.
-- Unlike user_can_delete_users_for_tenant it leaves super admins out, so RLS
-- grants them no cross-tenant writes to the list.
create or replace function public.carmen_is_tenant_owner(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.tenant_id = p_tenant_id
        and ur.role in ('owner', 'agency_owner')
    )
    or exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id = p_tenant_id
        and tu.role in ('owner', 'agency_owner')
    );
$$;

revoke all on function public.carmen_is_tenant_owner(uuid) from public, anon;
grant execute on function public.carmen_is_tenant_owner(uuid) to authenticated, service_role;

-- Staff of one organization (a user_roles row in it, profile not inactive)
-- with the phone Carmen reports to: the linked campaigner's phone, else the
-- profile phone. No caller check; carmen_report_staff and the carry-over below
-- are its only callers.
create or replace function public.carmen_report_staff_rows(p_tenant_id uuid)
returns table (user_id uuid, full_name text, phone text, is_owner boolean)
language sql
stable
set search_path = ''
as $$
  select ur.user_id,
         p.full_name,
         coalesce(nullif(btrim(c.phone), ''), nullif(btrim(p.phone), '')),
         bool_or(ur.role in ('owner', 'agency_owner'))
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  left join public.campaigners c on c.id = p.campaigner_id
  where ur.tenant_id = p_tenant_id
    and p.status is distinct from 'inactive'
  group by ur.user_id, p.full_name, c.phone, p.phone
  order by p.full_name nulls last, ur.user_id;
$$;

revoke all on function public.carmen_report_staff_rows(uuid) from public, anon, authenticated;

-- carmen_report_staff_rows for the service role and the organization's owners.
create or replace function public.carmen_report_staff(p_tenant_id uuid)
returns table (user_id uuid, full_name text, phone text, is_owner boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.carmen_is_tenant_owner(p_tenant_id) then
    raise exception 'carmen_report_staff: only owners of this organization may list its staff'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select s.user_id, s.full_name, s.phone, s.is_owner
  from public.carmen_report_staff_rows(p_tenant_id) s;
end;
$$;

revoke all on function public.carmen_report_staff(uuid) from public, anon, authenticated;
grant execute on function public.carmen_report_staff(uuid) to authenticated, service_role;

-- True when the phone belongs to a client or a client contact of the
-- organization. Internal: the guard, the carry-over and
-- carmen_report_client_phones call it.
create or replace function public.carmen_is_client_phone(p_tenant_id uuid, p_phone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
      select 1 from public.clients c
      where c.tenant_id = p_tenant_id
        and public.phone_match_key(c.phone) = public.phone_match_key(p_phone)
    )
    or exists (
      select 1 from public.client_contacts cc
      where cc.tenant_id = p_tenant_id
        and public.phone_match_key(cc.phone) = public.phone_match_key(p_phone)
    );
$$;

revoke all on function public.carmen_is_client_phone(uuid, text) from public, anon, authenticated;
grant execute on function public.carmen_is_client_phone(uuid, text) to service_role;

-- Extra phones on the organization's list that now belong to a client or
-- client contact, for the service role and the organization's owners. Each
-- send skips them and the settings screen flags them: the guard only sees the
-- client that existed when the phone was added.
create or replace function public.carmen_report_client_phones(p_tenant_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.carmen_is_tenant_owner(p_tenant_id) then
    raise exception 'carmen_report_client_phones: only owners of this organization may check its list'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select r.phone
  from public.carmen_report_recipients r
  where r.tenant_id = p_tenant_id
    and r.phone is not null
    and public.carmen_is_client_phone(p_tenant_id, r.phone);
end;
$$;

revoke all on function public.carmen_report_client_phones(uuid) from public, anon, authenticated;
grant execute on function public.carmen_report_client_phones(uuid) to authenticated, service_role;

-- Rejects a write by anyone signed in who is not an owner of the organization,
-- before saying anything about it; then an extra phone that belongs to a
-- client or client contact, or a user who is not staff of the organization.
-- BEFORE triggers run ahead of the RLS WITH CHECK, so the ownership check must
-- come first. The carry-over and service-role writes have no auth.uid().
create or replace function public.carmen_report_recipients_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP in ('INSERT', 'UPDATE') then
    if auth.uid() is not null
       and not public.carmen_is_tenant_owner(new.tenant_id) then
      raise exception 'carmen_report_recipients: only owners of this organization may change its recipients'
        using errcode = 'insufficient_privilege';
    end if;

    if new.phone is not null
       and public.carmen_is_client_phone(new.tenant_id, new.phone) then
      raise exception 'carmen_report_recipients: % is a client phone of this organization', new.phone
        using errcode = 'check_violation';
    end if;

    if new.user_id is not null and not exists (
      select 1 from public.user_roles ur
      where ur.user_id = new.user_id
        and ur.tenant_id = new.tenant_id
    ) then
      raise exception 'carmen_report_recipients: user % is not staff of this organization', new.user_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.carmen_report_recipients_guard() from public, anon, authenticated;

drop trigger if exists carmen_report_recipients_guard on public.carmen_report_recipients;
create trigger carmen_report_recipients_guard
  before insert or update on public.carmen_report_recipients
  for each row execute function public.carmen_report_recipients_guard();

alter table public.carmen_report_recipients enable row level security;

-- Staff and owners of the organization, and super admins (who view every
-- organization, TENANT_ISOLATION.md), read whom its Carmen reports to.
drop policy if exists "Staff read carmen_report_recipients" on public.carmen_report_recipients;
create policy "Staff read carmen_report_recipients" on public.carmen_report_recipients
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.tenant_id = carmen_report_recipients.tenant_id
    )
    or public.carmen_is_tenant_owner(tenant_id)
    or public.is_super_admin((select auth.uid()))
  );

-- Only owners and agency owners of the organization add recipients.
drop policy if exists "Owners add carmen_report_recipients" on public.carmen_report_recipients;
create policy "Owners add carmen_report_recipients" on public.carmen_report_recipients
  for insert to authenticated
  with check (public.carmen_is_tenant_owner(tenant_id));

-- Only owners and agency owners of the organization remove recipients.
drop policy if exists "Owners remove carmen_report_recipients" on public.carmen_report_recipients;
create policy "Owners remove carmen_report_recipients" on public.carmen_report_recipients
  for delete to authenticated
  using (public.carmen_is_tenant_owner(tenant_id));

revoke all on table public.carmen_report_recipients from anon, authenticated;
grant select, insert, delete on table public.carmen_report_recipients to authenticated;
grant all on table public.carmen_report_recipients to service_role;

-- Carry each organization's campaign_pulse_phone into its list once. When
-- exactly one staff member has that phone, the row is that member, so it
-- follows their card and warns when they leave; otherwise it is an extra phone
-- labelled with the matching campaigner's name. Organizations that already
-- have a list, phones that are not E.164 after normalising, and client phones
-- are skipped; campaign_pulse_phone itself is left as it is until AIO-276
-- removes it.
do $carry$
declare
  v_found integer;
  v_carried integer;
begin
  with pulse_phones as (
    select s.tenant_id,
           '+' || regexp_replace(
             public.carmen_normalize_staff_phone(s.campaign_pulse_phone),
             '^9720', '972'
           ) as phone
    from public.tenant_heartbeat_settings s
    where nullif(btrim(s.campaign_pulse_phone), '') is not null
  ),
  eligible as (
    select pp.tenant_id, pp.phone
    from pulse_phones pp
    where pp.phone ~ '^\+[1-9][0-9]{8,14}$'
      and not exists (
        select 1 from public.carmen_report_recipients r
        where r.tenant_id = pp.tenant_id
      )
      and not public.carmen_is_client_phone(pp.tenant_id, pp.phone)
  ),
  staff_match as (
    select e.tenant_id, e.phone, (array_agg(st.user_id))[1] as user_id
    from eligible e
    cross join lateral public.carmen_report_staff_rows(e.tenant_id) st
    where public.phone_match_key(st.phone) = public.phone_match_key(e.phone)
    group by e.tenant_id, e.phone
    having count(*) = 1
  ),
  carried as (
    insert into public.carmen_report_recipients (tenant_id, user_id, phone, label)
    select e.tenant_id,
           m.user_id,
           case when m.user_id is null then e.phone end,
           case when m.user_id is null then coalesce(
             (
               select left(btrim(cp.full_name), 80)
               from public.campaigners cp
               where cp.tenant_id = e.tenant_id
                 and nullif(btrim(cp.full_name), '') is not null
                 and public.phone_match_key(cp.phone) = public.phone_match_key(e.phone)
               order by cp.active desc nulls last, cp.full_name
               limit 1
             ),
             'מספר הדופק הקודם'
           ) end
    from eligible e
    left join staff_match m on m.tenant_id = e.tenant_id and m.phone = e.phone
    on conflict do nothing
    returning tenant_id
  )
  select (select count(*) from pulse_phones), (select count(*) from carried)
  into v_found, v_carried;

  if v_carried < v_found then
    raise notice 'carmen_report_recipients: carried % of % campaign_pulse_phone values; the rest are not E.164, belong to a client, or the organization already has a list',
      v_carried, v_found;
  end if;
end
$carry$;

comment on column public.tenant_heartbeat_settings.campaign_pulse_phone is
  'Deprecated (AIO-260): carried into carmen_report_recipients once; the app no longer reads or edits it. Removal: AIO-276.';
