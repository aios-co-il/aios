-- AIO-321: every user can be made inactive in an organization or deleted, and
-- their updates stay in history under their name.
--
-- 1. profiles.deleted_at marks a deleted account. delete-user keeps the
--    profile row (name kept, email anonymized, status inactive) and
--    soft-deletes the auth user (GoTrue keeps the auth.users row, clears its
--    email, password, identities and sessions), so profiles_id_fkey (ON DELETE
--    CASCADE) never fires and every history row still reaches the writer's
--    name.
-- 2. tenant_inactive_members: people who were members of an organization and
--    are no longer active there, 'inactive' (can be reactivated) or 'deleted'.
--    Access to an organization comes from the tenant_users row itself (110
--    policies and 38 functions read it directly), so a flag on that row would
--    leave an inactive member their access. Deactivating moves the membership
--    here instead: the tenant_users row and the organization's user_roles rows
--    are removed, and kept here so reactivating restores them. Members of the
--    organization and super admins read it; the organization's owner, or a
--    super admin acting in it, writes it (never their own row).
-- 3. Members of an organization read the profiles of its inactive and deleted
--    members, so history keeps showing their names.
-- 4. offboard_tenant_member / reactivate_tenant_member (service role only) are
--    the data side of delete-user and set-user-active, each one transaction.
--    They refuse the actor themself, a super admin and the organization's last
--    owner before changing anything. Offboarding also turns off the member's
--    campaigner and sales person cards in that organization (assignee pickers
--    and Carmen's team read active cards) and closes their open invitations
--    there; reactivating turns back on the cards that were on.
-- 5. Foreign keys: each key from a public table to auth.users or profiles that
--    would block deleting the user (no ON DELETE action) or delete history
--    with them becomes ON DELETE SET NULL, for a hard delete from the dashboard
--    or SQL. client_updates, lead_updates and task_updates.user_id (CASCADE,
--    NOT NULL) become nullable: every writer sets the column, and the two SQL
--    writers (record_client_card_entry, log_client_mood_status_change) check
--    for a user first. Keys of personal data, credentials and memberships keep
--    CASCADE. A swap drops and re-adds the key in one ALTER TABLE, so the new
--    key is validated and there is no moment without one.
--    client_updates_keep_owner lets the key's SET NULL through (it refused
--    every user_id change).
--
-- Locks: each swap takes ACCESS EXCLUSIVE on its table (about 25 small
-- tables) and SHARE ROW EXCLUSIVE on auth.users or profiles until commit,
-- which blocks sign-ins and profile writes for that second; lock_timeout fails
-- the deploy after 5 seconds instead of queueing behind a long transaction.
--
-- No row changes, and nothing is sent. Safe to re-run: a key already ON
-- DELETE SET NULL is left alone, and each object is created or replaced. The
-- closing guard requires that no key to auth.users or profiles blocks a
-- delete, that the history keys are SET NULL on nullable columns, and that
-- only the reviewed keys cascade.

set local lock_timeout = '5s';

-- 1. Deleted accounts.

alter table public.profiles add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the account was deleted (AIO-321): the row and name stay for history, the email is anonymized and the login is gone.';

-- 2. Inactive and deleted members of an organization.

create table if not exists public.tenant_inactive_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  member_role text not null default 'member',
  roles public.app_role[] not null default '{}',
  campaigner_was_active boolean,
  sales_person_was_active boolean,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  primary key (tenant_id, user_id),
  constraint tenant_inactive_members_status_check check (status in ('inactive', 'deleted'))
);

create index if not exists tenant_inactive_members_user_idx
  on public.tenant_inactive_members (user_id);

comment on table public.tenant_inactive_members is
  'Members no longer active in an organization (AIO-321): inactive (their tenant_users role and user_roles roles are kept here for reactivation) or deleted. History reads it to mark their names.';

alter table public.tenant_inactive_members enable row level security;

revoke all on table public.tenant_inactive_members from public, anon;
grant select, insert, update, delete on table public.tenant_inactive_members to authenticated;
grant all on table public.tenant_inactive_members to service_role;

-- Caller is the organization's owner, or a super admin acting in it.
create or replace function public.caller_manages_tenant_members(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.caller_owns_tenant(_tenant_id)
    or (
      public.is_super_admin(auth.uid())
      and _tenant_id = public.get_user_tenant_id(auth.uid())
    );
$$;

revoke all on function public.caller_manages_tenant_members(uuid) from public, anon, authenticated;
grant execute on function public.caller_manages_tenant_members(uuid) to authenticated, service_role;

drop policy if exists tenant_inactive_members_select on public.tenant_inactive_members;
drop policy if exists tenant_inactive_members_insert on public.tenant_inactive_members;
drop policy if exists tenant_inactive_members_update on public.tenant_inactive_members;
drop policy if exists tenant_inactive_members_delete on public.tenant_inactive_members;

-- Members of the organization read who is inactive or deleted there; super admins read every organization.
create policy tenant_inactive_members_select
on public.tenant_inactive_members
for select
to authenticated
using (
  public.user_is_tenant_member(tenant_id)
  or public.is_super_admin(auth.uid())
);

-- The owner, or a super admin acting in the organization, records another member.
create policy tenant_inactive_members_insert
on public.tenant_inactive_members
for insert
to authenticated
with check (
  user_id <> auth.uid()
  and public.caller_manages_tenant_members(tenant_id)
);

-- The same rule before and after, so a row never moves to another organization or to the caller.
create policy tenant_inactive_members_update
on public.tenant_inactive_members
for update
to authenticated
using (
  user_id <> auth.uid()
  and public.caller_manages_tenant_members(tenant_id)
)
with check (
  user_id <> auth.uid()
  and public.caller_manages_tenant_members(tenant_id)
);

-- The owner, or a super admin acting in the organization, removes another member's row.
create policy tenant_inactive_members_delete
on public.tenant_inactive_members
for delete
to authenticated
using (
  user_id <> auth.uid()
  and public.caller_manages_tenant_members(tenant_id)
);

-- A member who joins the organization again (an invitation, a role grant) is active there.
create or replace function public.tenant_users_clear_inactive_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    delete from public.tenant_inactive_members
    where tenant_id = new.tenant_id
      and user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.tenant_users_clear_inactive_member() from public, anon, authenticated;

drop trigger if exists tenant_users_clear_inactive_member on public.tenant_users;
create trigger tenant_users_clear_inactive_member
after insert on public.tenant_users
for each row
execute function public.tenant_users_clear_inactive_member();

-- 3. Members read the profiles of the organization's inactive and deleted members.

drop policy if exists "Members view profiles of inactive members" on public.profiles;

-- A profile is readable by members of an organization it is inactive or deleted in.
create policy "Members view profiles of inactive members"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.tenant_inactive_members m
    where m.user_id = profiles.id
      and public.user_is_tenant_member(m.tenant_id)
  )
);

-- 4. Offboarding and reactivating.

-- Whether the user owns the organization: an owner role there or an owner membership.
create or replace function public.tenant_member_is_owner(p_tenant_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.user_roles ur
      where ur.user_id = p_user_id
        and ur.tenant_id = p_tenant_id
        and ur.role = 'owner'::public.app_role
    )
    or exists (
      select 1 from public.tenant_users tu
      where tu.user_id = p_user_id
        and tu.tenant_id = p_tenant_id
        and tu.role = 'owner'
    );
$$;

revoke all on function public.tenant_member_is_owner(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tenant_member_is_owner(uuid, uuid) to service_role;

-- Moves a member out of the organization ('inactive' or 'deleted'), and
-- deletes the account (keeping the profile and name) when 'deleted' leaves
-- them no organization. The caller (delete-user, set-user-active) has checked
-- that p_actor manages the organization's members.
create or replace function public.offboard_tenant_member(
  p_tenant_id uuid,
  p_user_id uuid,
  p_actor uuid,
  p_status text
)
returns table (remaining_tenants integer, account_deleted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_member public.tenant_users%rowtype;
  v_prior public.tenant_inactive_members%rowtype;
  v_roles public.app_role[];
  v_campaigner_active boolean;
  v_sales_person_active boolean;
  v_remaining integer;
begin
  if p_status is null or p_status not in ('inactive', 'deleted') then
    raise exception 'offboard_tenant_member: status must be inactive or deleted, not %', p_status
      using errcode = '22023';
  end if;
  if p_user_id = p_actor then
    raise exception 'offboard_tenant_member: a user cannot remove themselves'
      using errcode = '42501';
  end if;
  if public.is_super_admin(p_user_id) then
    raise exception 'offboard_tenant_member: user % is a super admin', p_user_id
      using errcode = '42501';
  end if;

  -- One change to an organization's members at a time, so two owners cannot remove each other.
  perform pg_advisory_xact_lock(hashtextextended('tenant_members:' || p_tenant_id::text, 0));

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'offboard_tenant_member: user % has no profile', p_user_id
      using errcode = 'P0002';
  end if;
  select * into v_member from public.tenant_users
  where tenant_id = p_tenant_id and user_id = p_user_id;
  select * into v_prior from public.tenant_inactive_members
  where tenant_id = p_tenant_id and user_id = p_user_id;

  if v_member.user_id is null and v_prior.user_id is null then
    raise exception 'offboard_tenant_member: user % is not a member of tenant %', p_user_id, p_tenant_id
      using errcode = 'P0002';
  end if;
  if v_member.user_id is null and v_prior.status = 'deleted' and p_status = 'inactive' then
    raise exception 'offboard_tenant_member: user % was deleted from tenant %', p_user_id, p_tenant_id
      using errcode = '22023';
  end if;

  if v_member.user_id is not null then
    if public.tenant_member_is_owner(p_tenant_id, p_user_id)
       and not exists (
         select 1
         from public.tenant_users tu
         where tu.tenant_id = p_tenant_id
           and tu.user_id <> p_user_id
           and public.tenant_member_is_owner(p_tenant_id, tu.user_id)
       ) then
      raise exception 'offboard_tenant_member: user % is the last owner of tenant %', p_user_id, p_tenant_id
        using errcode = '23514';
    end if;

    select coalesce(array_agg(ur.role order by ur.role), '{}') into v_roles
    from public.user_roles ur
    where ur.user_id = p_user_id and ur.tenant_id = p_tenant_id;
    select c.active into v_campaigner_active
    from public.campaigners c
    where c.id = v_profile.campaigner_id and c.tenant_id = p_tenant_id;
    select s.active into v_sales_person_active
    from public.sales_people s
    where s.id = v_profile.sales_person_id and s.tenant_id = p_tenant_id;

    insert into public.tenant_inactive_members as m (
      tenant_id, user_id, status, member_role, roles,
      campaigner_was_active, sales_person_was_active, changed_at, changed_by
    ) values (
      p_tenant_id, p_user_id, p_status, v_member.role, v_roles,
      v_campaigner_active, v_sales_person_active, now(), p_actor
    )
    on conflict (tenant_id, user_id) do update
      set status = excluded.status,
          member_role = excluded.member_role,
          roles = excluded.roles,
          campaigner_was_active = excluded.campaigner_was_active,
          sales_person_was_active = excluded.sales_person_was_active,
          changed_at = excluded.changed_at,
          changed_by = excluded.changed_by;

    update public.campaigners
    set active = false
    where id = v_profile.campaigner_id and tenant_id = p_tenant_id and active;
    update public.sales_people
    set active = false
    where id = v_profile.sales_person_id and tenant_id = p_tenant_id and active;
    update public.invitation_tokens
    set used = true
    where tenant_id = p_tenant_id and lower(email) = lower(v_profile.email) and not used;

    delete from public.user_roles where user_id = p_user_id and tenant_id = p_tenant_id;
    delete from public.tenant_users where tenant_id = p_tenant_id and user_id = p_user_id;
  elsif v_prior.status is distinct from p_status then
    update public.tenant_inactive_members
    set status = p_status, changed_at = now(), changed_by = p_actor
    where tenant_id = p_tenant_id and user_id = p_user_id;
  end if;

  select count(*)::integer into v_remaining
  from public.tenant_users where user_id = p_user_id;

  if p_status = 'deleted' and v_remaining = 0 then
    delete from public.user_permissions where user_id = p_user_id;
    delete from public.user_managed_agencies where user_id = p_user_id;
    delete from public.user_roles where user_id = p_user_id;
    delete from public.user_active_tenant where user_id = p_user_id;
    update public.tenant_inactive_members
    set status = 'deleted', changed_at = now(), changed_by = p_actor
    where user_id = p_user_id and status <> 'deleted';
    update public.profiles
    set deleted_at = coalesce(deleted_at, now()),
        status = 'inactive',
        email = 'deleted-' || id::text || '@deleted.invalid',
        phone = null
    where id = p_user_id;
    return query select v_remaining, true;
    return;
  end if;

  return query select v_remaining, false;
end;
$$;

revoke all on function public.offboard_tenant_member(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.offboard_tenant_member(uuid, uuid, uuid, text) to service_role;

-- Gives an inactive member back their membership, roles and active cards in the organization.
create or replace function public.reactivate_tenant_member(
  p_tenant_id uuid,
  p_user_id uuid,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_prior public.tenant_inactive_members%rowtype;
begin
  if p_user_id = p_actor then
    raise exception 'reactivate_tenant_member: a user cannot reactivate themselves'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tenant_members:' || p_tenant_id::text, 0));

  select * into v_profile from public.profiles where id = p_user_id for update;
  select * into v_prior from public.tenant_inactive_members
  where tenant_id = p_tenant_id and user_id = p_user_id;

  if v_prior.user_id is null or v_prior.status <> 'inactive' then
    raise exception 'reactivate_tenant_member: user % is not inactive in tenant %', p_user_id, p_tenant_id
      using errcode = 'P0002';
  end if;
  if v_profile.id is null or v_profile.deleted_at is not null then
    raise exception 'reactivate_tenant_member: user % was deleted', p_user_id
      using errcode = '22023';
  end if;

  insert into public.tenant_users (tenant_id, user_id, role)
  values (p_tenant_id, p_user_id, v_prior.member_role)
  on conflict (tenant_id, user_id) do nothing;
  insert into public.user_roles (user_id, role, tenant_id)
  select p_user_id, r.role, p_tenant_id
  from unnest(v_prior.roles) as r(role)
  on conflict (user_id, role, tenant_id) do nothing;

  update public.campaigners
  set active = true
  where id = v_profile.campaigner_id and tenant_id = p_tenant_id
    and v_prior.campaigner_was_active and not active;
  update public.sales_people
  set active = true
  where id = v_profile.sales_person_id and tenant_id = p_tenant_id
    and v_prior.sales_person_was_active and not active;

  delete from public.tenant_inactive_members
  where tenant_id = p_tenant_id and user_id = p_user_id;
end;
$$;

revoke all on function public.reactivate_tenant_member(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reactivate_tenant_member(uuid, uuid, uuid) to service_role;

-- 5. Foreign keys keep history when a user is deleted.

-- client_updates_keep_owner (20261030093000) refused every user_id change, so
-- it would refuse client_updates_user_id_fkey's SET NULL too and fail the
-- delete. It now lets user_id become NULL only once that profile is gone,
-- which only the key's own action does. Definer, so the profile check does
-- not depend on what the editor may read.
create or replace function public.client_updates_keep_owner()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if TG_OP = 'UPDATE'
    and (
      new.client_id is distinct from old.client_id
      or new.tenant_id is distinct from old.tenant_id
      or new.source is distinct from old.source
      or new.source_ref is distinct from old.source_ref
      or (
        new.user_id is distinct from old.user_id
        and not (
          new.user_id is null
          and not exists (select 1 from public.profiles p where p.id = old.user_id)
        )
      )
    ) then
    raise exception 'client_updates: client_id, tenant_id, source, source_ref and user_id cannot change'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.client_updates_keep_owner() from public, anon, authenticated;

do $$
declare
  r record;
  v_def text;
begin
  for r in
    select c.oid, c.conname, c.conrelid::regclass as tbl, a.attname, a.attnotnull,
           (h.tbl is not null) as is_history
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    left join (values
      ('public.client_updates'::regclass, 'client_updates_user_id_fkey'),
      ('public.lead_updates'::regclass, 'lead_updates_user_id_fkey'),
      ('public.task_updates'::regclass, 'task_updates_user_id_fkey')
    ) as h(tbl, conname) on h.tbl = c.conrelid and h.conname = c.conname
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and (
        c.confdeltype in ('a', 'r')
        or not c.convalidated
        or (h.tbl is not null and c.confdeltype <> 'n')
      )
    order by c.conrelid::regclass::text, c.conname
  loop
    if cardinality((select conkey from pg_constraint where oid = r.oid)) <> 1 then
      raise exception 'user FK %.% has more than one column; review it by hand', r.tbl, r.conname;
    end if;
    if r.attnotnull and not r.is_history then
      raise exception 'user FK %.% is on NOT NULL column %; review it by hand', r.tbl, r.conname, r.attname;
    end if;

    v_def := pg_get_constraintdef(r.oid);
    v_def := regexp_replace(v_def, ' NOT VALID$', '');
    v_def := regexp_replace(v_def, ' ON DELETE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)', '');
    v_def := regexp_replace(v_def, '( DEFERRABLE.*)?$', ' ON DELETE SET NULL\1');

    if r.is_history then
      execute format(
        'alter table %s alter column %I drop not null, drop constraint %I, add constraint %I %s',
        r.tbl, r.attname, r.conname, r.conname, v_def
      );
    else
      execute format(
        'alter table %s drop constraint %I, add constraint %I %s',
        r.tbl, r.conname, r.conname, v_def
      );
    end if;
    raise notice 'user FK %.% now %', r.tbl, r.conname, v_def;
  end loop;
end $$;

-- Closing guard.
do $$
declare
  v_bad text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' order by 1)
  into v_bad
  from pg_constraint c
  where c.contype = 'f'
    and c.connamespace = 'public'::regnamespace
    and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and (c.confdeltype in ('a', 'r') or not c.convalidated);
  if v_bad is not null then
    raise exception 'user FKs that still block a user delete or are not validated: %', v_bad;
  end if;

  select string_agg(h.tbl::text || '.' || h.conname, ', ' order by 1)
  into v_bad
  from (values
    ('public.client_updates'::regclass, 'client_updates_user_id_fkey'),
    ('public.lead_updates'::regclass, 'lead_updates_user_id_fkey'),
    ('public.task_updates'::regclass, 'task_updates_user_id_fkey')
  ) as h(tbl, conname)
  left join pg_constraint c on c.conrelid = h.tbl and c.conname = h.conname and c.contype = 'f'
  left join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.oid is null or c.confdeltype <> 'n' or a.attnotnull;
  if v_bad is not null then
    raise exception 'history FKs not ON DELETE SET NULL on a nullable column: %', v_bad;
  end if;

  -- Personal data, credentials and memberships: they go with the user.
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' order by 1)
  into v_bad
  from pg_constraint c
  where c.contype = 'f'
    and c.connamespace = 'public'::regnamespace
    and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and c.confdeltype = 'c'
    and c.conname not in (
      'ai_conversations_user_id_fkey', 'ai_memory_user_id_fkey',
      'calendar_shares_owner_user_id_fkey', 'calendar_shares_shared_with_user_id_fkey',
      'calendar_tokens_user_id_fkey', 'carmen_command_center_access_user_id_fkey',
      'carmen_report_recipients_user_id_fkey', 'gmail_allowed_labels_user_id_fkey',
      'gmail_blocked_senders_user_id_fkey', 'gmail_message_categories_user_id_fkey',
      'gmail_tokens_user_id_fkey', 'invitation_tokens_created_by_fkey', 'profiles_id_fkey',
      'tenant_inactive_members_user_id_fkey', 'tenant_integrations_user_id_fkey',
      'tenant_users_user_id_fkey', 'user_api_keys_user_id_fkey',
      'user_managed_agencies_user_id_fkey', 'user_permissions_user_id_fkey',
      'user_roles_user_id_fkey'
    );
  if v_bad is not null then
    raise exception 'user FKs that cascade and were not reviewed as personal data: %', v_bad;
  end if;
end $$;
