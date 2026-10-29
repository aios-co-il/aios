-- Owners grant roles, permissions and invitations only in a tenant they own.
--
-- The user_roles, user_permissions and invitation_tokens write policies
-- checked only "the caller is an owner" (has_role, which resolves the
-- caller's active tenant, not the row's). Any owner, and signup-tenant makes
-- anyone one, could grant any role in any tenant, super_admin included, give
-- any user any module permission, and mint an invitation into any tenant.
-- Any signed-in user could rewrite an invitation, and grant themselves
-- permissions (can_manage_user_permissions lets a user manage their own).
--
-- 1. caller_owns_tenant / caller_owns_tenant_of_user: has_role's owner rule
--    for a named tenant, and for "a tenant this user is a member of".
-- 2. user_roles: owners write rows of a tenant they own, never super_admin and
--    never tenant-less; super admins write any row. Delete keeps its rules,
--    scoped to the row's tenant.
-- 3. user_roles_guard_super_admin: whatever the policies say, a super_admin
--    row from a client or the service role is global and comes from a super
--    admin or the service role. The database owner is not limited (handle_new_user
--    runs as postgres; its invitations can carry super_admin only when a super
--    admin or the service role wrote them).
-- 4. user_permissions (no tenant_id; one row applies in all the user's
--    tenants): owners write rows of members of a tenant they own; super
--    admins any. Reads are unchanged.
-- 5. invitation_tokens: owners invite into a tenant they own and never as
--    super_admin; only the service role updates tokens.
-- 6. merge_orphan_profile_by_email (only handle_new_user calls it) and the
--    unused assign_role_by_email are no longer callable by clients.
--
-- Existing rows are not changed. The NOTICE counts tenant-scoped super_admin
-- rows, which is_super_admin ignores and which clients and edge functions can
-- no longer write.

-- Caller is an owner of this tenant: an owner row for it, or a global owner
-- row plus an owner membership there. Definer, so user_roles policies can
-- call it without recursing.
create or replace function public.caller_owns_tenant(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'owner'::public.app_role
      and (
        ur.tenant_id = _tenant_id
        or (
          ur.tenant_id is null
          and exists (
            select 1
            from public.tenant_users tu
            where tu.user_id = auth.uid()
              and tu.tenant_id = _tenant_id
              and tu.role = 'owner'
          )
        )
      )
  );
$$;

revoke all on function public.caller_owns_tenant(uuid) from public, anon, authenticated;
grant execute on function public.caller_owns_tenant(uuid) to authenticated, service_role;

-- Caller owns a tenant this user is a member of (tenant_users).
create or replace function public.caller_owns_tenant_of_user(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.user_id = _user_id
      and public.caller_owns_tenant(tu.tenant_id)
  );
$$;

revoke all on function public.caller_owns_tenant_of_user(uuid) from public, anon, authenticated;
grant execute on function public.caller_owns_tenant_of_user(uuid) to authenticated, service_role;

drop policy if exists "Owners can insert roles" on public.user_roles;
drop policy if exists "Owners can update roles" on public.user_roles;
drop policy if exists "Owners can delete roles with restrictions" on public.user_roles;
drop policy if exists "Super admins can delete roles" on public.user_roles;
drop policy if exists "Owners or super admins insert roles" on public.user_roles;
drop policy if exists "Owners or super admins update roles" on public.user_roles;
drop policy if exists "Owners delete roles in their tenant" on public.user_roles;

-- A super admin adds any role; an owner adds a non-super_admin role in a tenant it owns.
create policy "Owners or super admins insert roles"
on public.user_roles
for insert
to authenticated
with check (
  public.is_super_admin(auth.uid())
  or (
    tenant_id is not null
    and role <> 'super_admin'::public.app_role
    and public.caller_owns_tenant(tenant_id)
  )
);

-- The same rule before and after, so an owner cannot move a row out of its tenant or into super_admin.
create policy "Owners or super admins update roles"
on public.user_roles
for update
to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    tenant_id is not null
    and role <> 'super_admin'::public.app_role
    and public.caller_owns_tenant(tenant_id)
  )
)
with check (
  public.is_super_admin(auth.uid())
  or (
    tenant_id is not null
    and role <> 'super_admin'::public.app_role
    and public.caller_owns_tenant(tenant_id)
  )
);

-- An owner removes non-owner roles in a tenant it owns, and its own owner or super_admin role there.
create policy "Owners delete roles in their tenant"
on public.user_roles
for delete
to authenticated
using (
  tenant_id is not null
  and public.caller_owns_tenant(tenant_id)
  and (
    (role in ('owner'::public.app_role, 'super_admin'::public.app_role) and user_id = auth.uid())
    or role not in ('owner'::public.app_role, 'super_admin'::public.app_role)
  )
);

-- A super admin removes any role but another super admin's, and its own owner role only as before.
create policy "Super admins can delete roles"
on public.user_roles
for delete
to authenticated
using (
  public.is_super_admin(auth.uid())
  and (
    (role = 'owner'::public.app_role and user_id <> auth.uid())
    or (role = 'super_admin'::public.app_role and user_id = auth.uid())
    or role not in ('owner'::public.app_role, 'super_admin'::public.app_role)
  )
);

-- Refuses a new super_admin grant from a client or the service role unless it is global and comes from a super admin or the service role.
-- Invoker, so current_user is the role running the statement (definer callers such as handle_new_user run as postgres).
create or replace function public.user_roles_guard_super_admin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.role <> 'super_admin'::public.app_role then
    return new;
  end if;

  -- An UPDATE that keeps the same user's super_admin row where it is grants nothing new.
  if tg_op = 'UPDATE'
    and old.role = 'super_admin'::public.app_role
    and old.user_id = new.user_id
    and old.tenant_id is not distinct from new.tenant_id then
    return new;
  end if;

  -- The database owner (migrations, the SQL editor, postgres-owned definer functions) is trusted as before.
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if new.tenant_id is not null then
    raise exception 'super_admin is a global role: tenant_id must be null'
      using errcode = '42501';
  end if;

  if current_user = 'service_role' or public.is_super_admin(auth.uid()) then
    return new;
  end if;

  raise exception 'Only a super admin can grant super_admin'
    using errcode = '42501';
end;
$$;

revoke all on function public.user_roles_guard_super_admin() from public, anon, authenticated;

drop trigger if exists user_roles_guard_super_admin on public.user_roles;
create trigger user_roles_guard_super_admin
before insert or update on public.user_roles
for each row execute function public.user_roles_guard_super_admin();

drop policy if exists "Owners can insert permissions" on public.user_permissions;
drop policy if exists "Owners can update permissions" on public.user_permissions;
drop policy if exists "Owners can delete permissions" on public.user_permissions;
drop policy if exists "Users can insert permissions they can manage" on public.user_permissions;
drop policy if exists "Users can update permissions they can manage" on public.user_permissions;
drop policy if exists "Users can delete permissions they can manage" on public.user_permissions;
drop policy if exists "Owners or super admins insert permissions" on public.user_permissions;
drop policy if exists "Owners or super admins update permissions" on public.user_permissions;
drop policy if exists "Owners or super admins delete permissions" on public.user_permissions;

-- A super admin grants anyone; an owner grants members of a tenant it owns.
create policy "Owners or super admins insert permissions"
on public.user_permissions
for insert
to authenticated
with check (public.is_super_admin(auth.uid()) or public.caller_owns_tenant_of_user(user_id));

-- The same rule before and after, so a row cannot be handed to a user outside the owner's tenants.
create policy "Owners or super admins update permissions"
on public.user_permissions
for update
to authenticated
using (public.is_super_admin(auth.uid()) or public.caller_owns_tenant_of_user(user_id))
with check (public.is_super_admin(auth.uid()) or public.caller_owns_tenant_of_user(user_id));

-- A super admin removes anyone's; an owner removes those of members of a tenant it owns.
create policy "Owners or super admins delete permissions"
on public.user_permissions
for delete
to authenticated
using (public.is_super_admin(auth.uid()) or public.caller_owns_tenant_of_user(user_id));

drop policy if exists "Owners and super admins can create invitation tokens" on public.invitation_tokens;
drop policy if exists "Service role can update invitation tokens" on public.invitation_tokens;
drop policy if exists "Owners or super admins create invitation tokens" on public.invitation_tokens;

-- A super admin invites anywhere; an owner invites into a tenant it owns, never as super_admin.
create policy "Owners or super admins create invitation tokens"
on public.invitation_tokens
for insert
to authenticated
with check (
  public.is_super_admin(auth.uid())
  or (
    public.caller_owns_tenant(tenant_id)
    and coalesce(metadata ->> 'role', '') <> 'super_admin'
  )
);

-- Only the server marks a token used (process-user-invitation); clients never rewrite one.
create policy "Service role can update invitation tokens"
on public.invitation_tokens
for update
to service_role
using (true)
with check (true);

-- handle_new_user (definer, owned by postgres) is the only caller.
revoke all on function public.merge_orphan_profile_by_email(uuid, text) from public, anon, authenticated;
grant execute on function public.merge_orphan_profile_by_email(uuid, text) to service_role;

-- Unused since the baseline, and it inserted tenant-less roles of any kind; retired, as PR #638 proposed.
create or replace function public.assign_role_by_email(_email text, _role public.app_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'assign_role_by_email is retired' using errcode = '42501';
end;
$$;

revoke all on function public.assign_role_by_email(text, public.app_role) from public, anon, authenticated;

-- Reports the tenant-scoped super_admin rows this migration leaves in place.
do $$
declare
  v_scoped integer;
begin
  select count(*) into v_scoped
  from public.user_roles
  where role = 'super_admin'::public.app_role and tenant_id is not null;
  raise notice 'block_role_self_escalation: % tenant-scoped super_admin rows left unchanged', v_scoped;
end;
$$;
