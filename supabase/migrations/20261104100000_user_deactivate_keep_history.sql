-- AIO-321: every user can be made inactive in an organization or deleted, and
-- their updates stay in history under their name. AIO-326: a deleted user who
-- signs up again does not get their old organization back.
--
-- 1. profiles.deleted_at marks a deleted account. delete-user keeps the
--    profile row (name kept, email anonymized, status inactive) and
--    soft-deletes the auth user (GoTrue keeps the auth.users row, clears its
--    email, password, identities and sessions), so profiles_id_fkey (ON DELETE
--    CASCADE) never fires and history keeps pointing at the writer. A signed-in
--    user cannot change their own deleted_at, status or email
--    (profiles_keep_admin_fields); the service role can.
-- 2. tenant_inactive_members: people who were members of an organization and
--    are no longer active there, 'inactive' (can be reactivated) or 'deleted'.
--    Access to an organization comes from the tenant_users row itself (110
--    policies and 38 functions read it directly), so a flag on that row would
--    leave an inactive member their access. Deactivating moves the membership
--    here instead: the tenant_users row and the organization's user_roles rows
--    are removed and kept here, so reactivating restores them. Members of the
--    organization and super admins read it; only offboard_tenant_member writes
--    it (service role), so no client can plant a row or the roles it restores.
-- 3. tenant_departed_members(tenant ids) gives callers who belong to those
--    organizations the name and status of their inactive and deleted members,
--    and nothing else of their profile, so history keeps showing the writer.
--    get_latest_client_call_updates (the pulse "last call by" line) names a
--    departed writer the same way and never shows a deleted user's
--    anonymized email.
-- 4. offboard_tenant_member / reactivate_tenant_member (service role only) are
--    the data side of delete-user and set-user-active, each one transaction.
--    They refuse the actor themself, a super admin and the organization's last
--    owner before changing anything. Offboarding turns off the member's
--    campaigner and sales person cards in that organization (assignee pickers
--    and Carmen's team read active cards; the card triggers revoke the card's
--    Carmen WhatsApp identity and queue a Carmen knowledge refresh), closes
--    their open invitations there, and signs them out (auth.sessions and
--    auth.refresh_tokens) once no organization is left. Reactivating restores
--    the membership with its original created_at, the roles a member may hold
--    (never super_admin), and the cards that were on.
-- 5. handle_new_user links a new account only to an unused, unexpired
--    invitation (it took the newest one, used or not, so a deleted user who
--    signed up again got the old organization, role and permissions back).
-- 6. get_user_client_ids / get_user_agency_ids count a campaigner card only in
--    an organization the user is still a member of, so a member deactivated in
--    one organization and active in another stops reading the first one's
--    clients and agencies through their card there. Read-only check on
--    2026-11-03: no Production or Staging user has a card outside their
--    memberships, so nobody else loses access.
-- 7. Foreign keys: each key from a public table to auth.users or profiles that
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
-- DELETE SET NULL is left alone, and each object is created or replaced. An
-- earlier draft of this migration (version 20261103110000, applied only on
-- this PR's Preview branch) let owners write tenant_inactive_members and read
-- departed members' whole profiles; its policies and helper are dropped here.
-- The closing guard requires that no key to auth.users or profiles blocks a
-- delete, that the history keys are SET NULL on nullable columns, and that
-- only the reviewed keys cascade.

set local lock_timeout = '5s';

-- 1. Deleted accounts.

alter table public.profiles add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the account was deleted (AIO-321): the row and name stay for history, the email is anonymized and the login is gone.';

-- A signed-in user cannot change their own deleted_at, status or email; the service role and admins can.
create or replace function public.profiles_keep_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE'
    and auth.uid() is not null
    and auth.uid() = old.id
    and (
      new.deleted_at is distinct from old.deleted_at
      or new.status is distinct from old.status
      or new.email is distinct from old.email
    ) then
    raise exception 'profiles: deleted_at, status and email are not yours to change'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_keep_admin_fields() from public, anon, authenticated;

drop trigger if exists profiles_keep_admin_fields on public.profiles;
create trigger profiles_keep_admin_fields
before update of deleted_at, status, email on public.profiles
for each row
execute function public.profiles_keep_admin_fields();

-- 2. Inactive and deleted members of an organization.

create table if not exists public.tenant_inactive_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  member_role text not null default 'member',
  roles public.app_role[] not null default '{}',
  campaigner_was_active boolean,
  sales_person_was_active boolean,
  member_since timestamptz,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  primary key (tenant_id, user_id),
  constraint tenant_inactive_members_status_check check (status in ('inactive', 'deleted'))
);

alter table public.tenant_inactive_members add column if not exists member_since timestamptz;

create index if not exists tenant_inactive_members_user_idx
  on public.tenant_inactive_members (user_id);

comment on table public.tenant_inactive_members is
  'Members no longer active in an organization (AIO-321): inactive (their tenant_users row and user_roles roles are kept here for reactivation) or deleted. Written only by offboard_tenant_member and reactivate_tenant_member.';

alter table public.tenant_inactive_members enable row level security;

revoke all on table public.tenant_inactive_members from public, anon, authenticated;
grant select on table public.tenant_inactive_members to authenticated;
grant all on table public.tenant_inactive_members to service_role;

drop policy if exists tenant_inactive_members_select on public.tenant_inactive_members;
drop policy if exists tenant_inactive_members_insert on public.tenant_inactive_members;
drop policy if exists tenant_inactive_members_update on public.tenant_inactive_members;
drop policy if exists tenant_inactive_members_delete on public.tenant_inactive_members;
drop function if exists public.caller_manages_tenant_members(uuid);

-- Members of the organization read who is inactive or deleted there; super admins read every organization.
create policy tenant_inactive_members_select
on public.tenant_inactive_members
for select
to authenticated
using (
  public.user_is_tenant_member(tenant_id)
  or public.is_super_admin(auth.uid())
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

-- 3. Names of departed members, and nothing else of their profile.

drop policy if exists "Members view profiles of inactive members" on public.profiles;

-- Name (profile, else campaigner card) and status of the inactive and deleted members of the given organizations the caller belongs to; every one for the server.
create or replace function public.tenant_departed_members(p_tenant_ids uuid[])
returns table (tenant_id uuid, user_id uuid, full_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.tenant_id,
         m.user_id,
         coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(c.full_name), '')),
         m.status
  from public.tenant_inactive_members m
  join public.profiles p on p.id = m.user_id
  left join public.campaigners c on c.id = p.campaigner_id
  where m.tenant_id = any (p_tenant_ids)
    and (
      auth.uid() is null
      or public.user_is_tenant_member(m.tenant_id)
      or public.is_super_admin(auth.uid())
    );
$$;

revoke all on function public.tenant_departed_members(uuid[]) from public, anon, authenticated;
grant execute on function public.tenant_departed_members(uuid[]) to authenticated, service_role;

-- Latest client call per client and who made it; a departed caller keeps their name, a deleted one without a name reads as a deleted user.
create or replace function public.get_latest_client_call_updates(p_client_ids uuid[])
returns table (client_id uuid, last_client_call_at timestamptz, last_client_call_by text)
language sql
stable
set search_path to 'public'
as $$
  with latest as (
    select distinct on (updates.client_id)
      updates.client_id,
      updates.created_at,
      updates.user_id,
      updates.tenant_id
    from public.client_updates as updates
    where updates.client_id = any (p_client_ids)
      and updates.source in ('human', 'carmen_confirmed')
      and (
        updates.counts_as_contact is true
        or updates.update_type = 'call'
        or (
          updates.update_type = 'weekly_update'
          and public.client_update_documents_phone_call(updates.content)
        )
      )
    order by updates.client_id, updates.created_at desc
  )
  select latest.client_id,
         latest.created_at,
         coalesce(
           nullif(btrim(profiles.full_name), ''),
           departed.full_name,
           case
             when departed.status = 'deleted' or profiles.deleted_at is not null then 'משתמש שנמחק'
             else profiles.email
           end
         )
  from latest
  left join public.profiles as profiles on profiles.id = latest.user_id
  left join lateral (
    select d.full_name, d.status
    from public.tenant_departed_members(array[latest.tenant_id]) as d
    where d.user_id = latest.user_id
  ) as departed on true;
$$;

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

-- Moves a member out of the organization ('inactive' or 'deleted'), signs
-- them out once no organization is left, and deletes the account (keeping
-- the profile and name) when 'deleted' leaves them none. The caller
-- (delete-user, set-user-active) has checked that p_actor manages the
-- organization's members.
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
    where ur.user_id = p_user_id
      and ur.tenant_id = p_tenant_id
      and ur.role <> 'super_admin'::public.app_role;
    select c.active into v_campaigner_active
    from public.campaigners c
    where c.id = v_profile.campaigner_id and c.tenant_id = p_tenant_id;
    select s.active into v_sales_person_active
    from public.sales_people s
    where s.id = v_profile.sales_person_id and s.tenant_id = p_tenant_id;

    insert into public.tenant_inactive_members as m (
      tenant_id, user_id, status, member_role, roles, campaigner_was_active,
      sales_person_was_active, member_since, changed_at, changed_by
    ) values (
      p_tenant_id, p_user_id, p_status, v_member.role, v_roles, v_campaigner_active,
      v_sales_person_active, v_member.created_at, now(), p_actor
    )
    on conflict (tenant_id, user_id) do update
      set status = excluded.status,
          member_role = excluded.member_role,
          roles = excluded.roles,
          campaigner_was_active = excluded.campaigner_was_active,
          sales_person_was_active = excluded.sales_person_was_active,
          member_since = excluded.member_since,
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

  if v_remaining = 0 then
    -- No organization left: end every session now (refresh tokens go with them).
    delete from auth.refresh_tokens where user_id = p_user_id::text;
    delete from auth.sessions where user_id = p_user_id;
  end if;

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

-- Gives an inactive member back their membership (original created_at),
-- the roles a member may hold there (never super_admin) and the cards that
-- were on. Refuses a super admin and a deleted account.
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
  if public.is_super_admin(p_user_id) then
    raise exception 'reactivate_tenant_member: user % is a super admin', p_user_id
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

  insert into public.tenant_users (tenant_id, user_id, role, created_at)
  values (p_tenant_id, p_user_id, v_prior.member_role, coalesce(v_prior.member_since, now()))
  on conflict (tenant_id, user_id) do nothing;
  insert into public.user_roles (user_id, role, tenant_id)
  select p_user_id, r.role, p_tenant_id
  from unnest(v_prior.roles) as r(role)
  where r.role <> 'super_admin'::public.app_role
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

-- 5. A new account links only to an unused, unexpired invitation (AIO-326).

-- Creates the profile of a new auth user, merges a pre-provisioned orphan profile, and applies the newest open invitation for the email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_inv    public.invitation_tokens%ROWTYPE;
  v_meta   jsonb;
  v_role   text;
  v_tenant uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'active')
  ON CONFLICT (id) DO NOTHING;

  -- Merge any pre-provisioned orphan profile with the same email.
  BEGIN
    PERFORM public.merge_orphan_profile_by_email(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user orphan merge failed for %: %', NEW.email, SQLERRM;
  END;

  BEGIN
    -- Only an invitation still open: a used or expired one (for example the
    -- one a deleted user once accepted) never links a new account.
    SELECT * INTO v_inv
    FROM public.invitation_tokens
    WHERE lower(email) = lower(NEW.email)
      AND NOT used
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_inv.id IS NOT NULL AND v_inv.tenant_id IS NOT NULL THEN
      v_meta   := COALESCE(v_inv.metadata, '{}'::jsonb);
      v_role   := NULLIF(v_meta->>'role', '');
      v_tenant := v_inv.tenant_id;

      INSERT INTO public.tenant_users (user_id, tenant_id, role)
      SELECT NEW.id, v_tenant, COALESCE(v_role, 'member')
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE user_id = NEW.id AND tenant_id = v_tenant
      );

      INSERT INTO public.user_active_tenant (user_id, tenant_id)
      SELECT NEW.id, v_tenant
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_active_tenant WHERE user_id = NEW.id
      );

      IF v_role IS NOT NULL THEN
        BEGIN
          INSERT INTO public.user_roles (user_id, role, tenant_id)
          VALUES (NEW.id, v_role::public.app_role, v_tenant)
          ON CONFLICT (user_id, role, tenant_id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'handle_new_user: bad role % for %: %', v_role, NEW.email, SQLERRM;
        END;
      END IF;

      IF jsonb_typeof(v_meta->'modulePermissions') = 'array' THEN
        INSERT INTO public.user_permissions (user_id, module, can_access)
        SELECT NEW.id, m.value, true
        FROM jsonb_array_elements_text(v_meta->'modulePermissions') AS m(value)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.user_permissions up
          WHERE up.user_id = NEW.id AND up.module = m.value
        );
      END IF;

      IF NULLIF(v_meta->>'campaignerId', '') IS NOT NULL THEN
        UPDATE public.profiles SET campaigner_id = (v_meta->>'campaignerId')::uuid WHERE id = NEW.id;
      END IF;
      IF NULLIF(v_meta->>'salesPersonId', '') IS NOT NULL THEN
        UPDATE public.profiles SET sales_person_id = (v_meta->>'salesPersonId')::uuid WHERE id = NEW.id;
      END IF;
    ELSE
      RAISE NOTICE 'handle_new_user: no open invitation for %', NEW.email;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user auto-link failed for %: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- 6. A campaigner card counts only in an organization the user is still a member of.

-- Clients the user works on: through their campaigner card in an organization they belong to, plus SEO-scope clients.
create or replace function public.get_user_client_ids(_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  WITH campaigner_clients AS (
    SELECT ct.client_id
    FROM public.profiles p
    JOIN public.campaigners c ON c.id = p.campaigner_id
    JOIN public.client_team ct ON ct.campaigner_id = p.campaigner_id
    WHERE p.id = _user_id
      AND public.has_role(_user_id, 'campaigner'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.user_id = _user_id
          AND tu.tenant_id = c.tenant_id
      )
  ),
  seo_clients AS (
    SELECT c.id AS client_id
    FROM public.clients c
    WHERE public.user_has_seo_scope(_user_id)
      AND (
        c.is_seo_client = true
        OR c.services @> '["seo"]'::jsonb
      )
      AND (
        c.tenant_id = public.get_user_tenant_id(_user_id)
        OR public.user_has_cross_tenant_agency_access(_user_id, c.agency_id)
      )
  )
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT client_id),
    ARRAY[]::uuid[]
  )
  FROM (
    SELECT client_id FROM campaigner_clients
    UNION ALL
    SELECT client_id FROM seo_clients
  ) combined
$function$;

-- Agencies of the user's campaigner card, when the card is in an organization they belong to.
create or replace function public.get_user_agency_ids(_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT ARRAY_AGG(ca.agency_id)
  FROM public.profiles p
  JOIN public.campaigners c ON c.id = p.campaigner_id
  JOIN public.campaigner_agencies ca ON ca.campaigner_id = p.campaigner_id
  WHERE p.id = _user_id
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = _user_id
        AND tu.tenant_id = c.tenant_id
    )
$function$;

-- 7. Foreign keys keep history when a user is deleted.

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
