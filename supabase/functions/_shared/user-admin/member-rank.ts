// Who ranks above whom (David's hierarchy, AIO-321): a super admin acting in
// an organization ranks above everyone there but a super admin (acting
// elsewhere, only their ordinary role there counts); an owner of a parent
// organization above everyone in its sub-organizations; an owner above
// everyone in their organization but another owner.
//
// Deactivate, reactivate and delete act on one organization and touch the
// account only when it was the user's last one, so they need the rank in that
// organization only (mayManageMember). An account-wide action, such as a
// password reset, needs it in every organization the user belongs to: check
// outranksIn for each. The SQL twin is actor_may_manage_member / member_outranks
// (20261104100000_user_deactivate_keep_history.sql); keep the two aligned.
import { type CallerRole, isGlobalSuperAdmin } from "./role-grant.ts";

/** One tenant_users row of a user. */
export type TenantMembership = { tenant_id: string; role: string };

/** A user as the rank rules read them: user_roles and tenant_users rows. */
export type RankedUser = {
  roles: ReadonlyArray<CallerRole>;
  memberships: ReadonlyArray<TenantMembership>;
};

/** Each organization's parent (tenants.parent_tenant_id); a root is absent or null. */
export type TenantParents = ReadonlyMap<string, string | null>;

/** The organization's parent, that one's parent, and so on. */
export function ancestorsOf(
  tenantId: string,
  parents: TenantParents,
): Array<string> {
  const chain: Array<string> = [];
  let parent = parents.get(tenantId) ?? null;
  while (parent && !chain.includes(parent) && chain.length < 20) {
    chain.push(parent);
    parent = parents.get(parent) ?? null;
  }
  return chain;
}

/** An owner role for the organization, or an owner membership in it (tenant_member_is_owner). */
export function ownsTenant(user: RankedUser, tenantId: string): boolean {
  return (
    user.roles.some((r) => r.tenant_id === tenantId && r.role === "owner") ||
    user.memberships.some((m) => m.tenant_id === tenantId && m.role === "owner")
  );
}

/** Whether the actor may manage anyone in the organization: its owner, an owner of a parent, or a super admin acting in it. */
export function canManageMembers(
  actor: RankedUser,
  tenantId: string,
  activeTenantId: string | null,
  parents: TenantParents,
): boolean {
  return (
    (isGlobalSuperAdmin(actor.roles) && activeTenantId === tenantId) ||
    ownsTenant(actor, tenantId) ||
    ancestorsOf(tenantId, parents).some((id) => ownsTenant(actor, id))
  );
}

/**
 * Whether the actor ranks above the target in one organization
 * (member_outranks). A super admin's rank counts only in the organization
 * they act in (`actorActiveTenantId`); elsewhere they hold their ordinary
 * role there. `targetWasOwner`: the target is inactive there and their kept
 * roles hold owner. For an account-wide action, require it for every
 * organization the target belongs to.
 */
export function outranksIn(
  actor: RankedUser,
  target: RankedUser,
  tenantId: string,
  parents: TenantParents,
  actorActiveTenantId: string | null,
  targetWasOwner = false,
): boolean {
  if (isGlobalSuperAdmin(target.roles)) {
    return false;
  }
  if (isGlobalSuperAdmin(actor.roles) && actorActiveTenantId === tenantId) {
    return true;
  }
  if (ancestorsOf(tenantId, parents).some((id) => ownsTenant(actor, id))) {
    return true;
  }
  return (
    ownsTenant(actor, tenantId) &&
    !ownsTenant(target, tenantId) &&
    !targetWasOwner
  );
}

/**
 * Whether the actor may deactivate, reactivate or delete the target in one
 * organization (actor_may_manage_member): the actor may manage that
 * organization and ranks above the target there. The target's other
 * organizations are not touched, so they are not checked.
 */
export function mayManageMember(input: {
  actorId: string;
  actor: RankedUser;
  actorActiveTenantId: string | null;
  targetId: string;
  target: RankedUser;
  tenantId: string;
  parents: TenantParents;
  targetWasOwner: boolean;
}): boolean {
  const { actor, target, tenantId, parents } = input;
  return (
    input.actorId !== input.targetId &&
    canManageMembers(actor, tenantId, input.actorActiveTenantId, parents) &&
    outranksIn(
      actor,
      target,
      tenantId,
      parents,
      input.actorActiveTenantId,
      input.targetWasOwner,
    )
  );
}
