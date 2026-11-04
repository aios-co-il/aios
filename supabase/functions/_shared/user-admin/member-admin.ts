import { bearerFrom } from "../auth/edge-caller-auth.ts";
import {
  type CallerRole,
  canManageMembers,
  isGlobalSuperAdmin,
} from "./role-grant.ts";

/** A refusal or failure with the HTTP status the caller sees. */
export class MemberAdminError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MemberAdminError";
  }
}

/** Where a user stands in one organization (tenant_users / tenant_inactive_members). */
export type Membership = "active" | "inactive" | "deleted" | "none";

/** What offboard_tenant_member reports. */
export type OffboardResult = {
  remainingTenants: number;
  accountDeleted: boolean;
};

/** Reads and writes of the member-admin flows; memberAdminStore is the Supabase one. */
export interface MemberAdminStore {
  callerFromToken(token: string): Promise<string | null>;
  rolesOf(userId: string): Promise<Array<CallerRole>>;
  activeTenantOf(userId: string): Promise<string | null>;
  userIdByEmail(email: string): Promise<string | null>;
  membershipOf(tenantId: string, userId: string): Promise<Membership>;
  activeTenantCount(userId: string): Promise<number>;
  authUserExists(userId: string): Promise<boolean>;
  offboard(
    tenantId: string,
    userId: string,
    actorId: string,
    status: "inactive" | "deleted",
  ): Promise<OffboardResult>;
  reactivate(tenantId: string, userId: string, actorId: string): Promise<void>;
  setSignInBlocked(userId: string, blocked: boolean): Promise<void>;
  softDeleteLogin(userId: string): Promise<void>;
}

/** The request body both flows take; set-user-active adds `active`. */
export type MemberRequest = {
  userId?: string;
  email?: string;
  tenantId?: string;
};

/** The string fields of a request body that name the target and tenant. */
export function memberRequestOf(body: Record<string, unknown>): MemberRequest {
  const text = (value: unknown) =>
    typeof value === "string" ? value : undefined;
  return {
    userId: text(body.userId),
    email: text(body.email),
    tenantId: text(body.tenantId),
  };
}

/** A checked request: the caller may change this target's membership in this tenant. */
export type MemberTarget = {
  callerId: string;
  tenantId: string;
  targetId: string;
  membership: Membership;
};

/**
 * Checks, before anything changes, that the caller is the organization's
 * owner or a super admin acting in it, and only then that the target is
 * someone else, no super admin, and a current or former member whose login
 * exists (so nobody else learns whether an email has an account).
 * offboard_tenant_member repeats the target rules and adds the last-owner
 * rule in the transaction that makes the change.
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
  const [callerRoles, activeTenantId] = await Promise.all([
    store.rolesOf(callerId),
    store.activeTenantOf(callerId),
  ]);
  if (!canManageMembers(callerRoles, tenantId, activeTenantId)) {
    throw new MemberAdminError(
      403,
      "Only the organization's owner, or a super admin acting in it, can manage its members",
    );
  }

  const targetId = await targetOf(store, body);
  if (targetId === callerId) {
    throw new MemberAdminError(409, "You cannot change your own membership");
  }
  if (isGlobalSuperAdmin(await store.rolesOf(targetId))) {
    throw new MemberAdminError(
      409,
      "A super admin cannot be deactivated or deleted here",
    );
  }

  const membership = await store.membershipOf(tenantId, targetId);
  if (membership === "none") {
    throw notAMember();
  }
  if (!(await store.authUserExists(targetId))) {
    throw new MemberAdminError(404, "The user's login was not found");
  }
  return { callerId, tenantId, targetId, membership };
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
