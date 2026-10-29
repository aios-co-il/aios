import type { TenantMembership, TenantParents } from "./member-rank.ts";
import type { CallerRole } from "./role-grant.ts";

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
  membershipsOf(userId: string): Promise<Array<TenantMembership>>;
  /** member_role and roles kept for an inactive or deleted member of the tenant. */
  formerRolesOf(tenantId: string, userId: string): Promise<Array<string>>;
  tenantParents(): Promise<TenantParents>;
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
