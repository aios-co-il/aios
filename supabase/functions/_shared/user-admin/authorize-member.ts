import { bearerFrom } from "../auth/edge-caller-auth.ts";
import {
  MemberAdminError,
  type MemberAdminStore,
  type MemberRequest,
  type MemberTarget,
} from "./member-admin.ts";
import {
  canManageMembers,
  mayManageMember,
  type RankedUser,
} from "./member-rank.ts";
import { isGlobalSuperAdmin } from "./role-grant.ts";

/**
 * Checks, before anything changes, that the caller may manage the
 * organization's members (member-rank.ts), and only then that the target is
 * someone else, no super admin, a current or former member whose login exists
 * (so nobody else learns whether an email has an account), and below the
 * caller in every organization they belong to. offboard_tenant_member
 * repeats the target rules and adds the last-owner rule in the transaction
 * that makes the change.
 */
export async function authorizeMemberChange(
  store: MemberAdminStore,
  authorization: string | null,
  body: MemberRequest,
): Promise<MemberTarget> {
  const callerId = await callerOf(store, authorization);
  const tenantId = body.tenantId?.trim();
  if (!tenantId) {
    throw new MemberAdminError(400, "tenantId is required");
  }
  const [caller, activeTenantId, parents] = await Promise.all([
    rankedUser(store, callerId),
    store.activeTenantOf(callerId),
    store.tenantParents(),
  ]);
  if (!canManageMembers(caller, tenantId, activeTenantId, parents)) {
    throw new MemberAdminError(
      403,
      "Only an owner of the organization or of its parent, or a super admin acting in it, can manage its members",
    );
  }

  const targetId = await targetOf(store, body);
  if (targetId === callerId) {
    throw new MemberAdminError(409, "You cannot change your own membership");
  }
  const target = await rankedUser(store, targetId);
  if (isGlobalSuperAdmin(target.roles)) {
    throw new MemberAdminError(
      409,
      "A super admin cannot be deactivated or deleted here",
    );
  }

  const membership = await store.membershipOf(tenantId, targetId);
  if (membership === "none") {
    throw notAMember();
  }
  const targetWasOwner =
    membership !== "active" &&
    (await store.formerRolesOf(tenantId, targetId)).includes("owner");
  const allowed = mayManageMember({
    actorId: callerId,
    actor: caller,
    actorActiveTenantId: activeTenantId,
    targetId,
    target,
    tenantId,
    parents,
    targetWasOwner,
  });
  if (!allowed) {
    throw new MemberAdminError(
      403,
      "You can change only users below you in every organization they belong to",
    );
  }
  if (!(await store.authUserExists(targetId))) {
    throw new MemberAdminError(404, "The user's login was not found");
  }
  return { callerId, tenantId, targetId, membership };
}

/** A user's roles and memberships, as the rank rules read them. */
async function rankedUser(
  store: MemberAdminStore,
  userId: string,
): Promise<RankedUser> {
  const [roles, memberships] = await Promise.all([
    store.rolesOf(userId),
    store.membershipsOf(userId),
  ]);
  return { roles, memberships };
}

/** The signed-in caller's id, or a 401. */
async function callerOf(
  store: MemberAdminStore,
  authorization: string | null,
): Promise<string> {
  const token = bearerFrom(authorization);
  if (!token) {
    throw new MemberAdminError(401, "Missing authorization header");
  }
  const callerId = await store.callerFromToken(token);
  if (!callerId) {
    throw new MemberAdminError(401, "Unauthorized");
  }
  return callerId;
}

/** The target's id, from userId or else email. */
async function targetOf(
  store: MemberAdminStore,
  body: MemberRequest,
): Promise<string> {
  const userId = body.userId?.trim();
  if (userId) {
    return userId;
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    throw new MemberAdminError(400, "userId or email is required");
  }
  const found = await store.userIdByEmail(email);
  if (!found) {
    throw notAMember();
  }
  return found;
}

/** One answer for an unknown email and a non-member, so neither reveals the other. */
function notAMember(): MemberAdminError {
  return new MemberAdminError(
    404,
    "The user is not a member of this organization",
  );
}
