// In-memory MemberAdminStore for the member-admin tests: the world is plain
// data, and every write is logged so a test can assert nothing changed.
import type {
  MemberAdminStore,
  Membership,
  OffboardResult,
} from "./member-admin.ts";
import type { CallerRole } from "./role-grant.ts";

export const TENANT_A = "11111111-1111-4111-8111-111111111111";
export const TENANT_B = "22222222-2222-4222-8222-222222222222";
export const PARENT = "33333333-3333-4333-8333-333333333333";
export const OWNER = "aaaaaaaa-0000-4000-8000-000000000001";
export const MEMBER = "aaaaaaaa-0000-4000-8000-000000000002";
export const ADMIN = "aaaaaaaa-0000-4000-8000-000000000003";
export const OTHER_OWNER = "aaaaaaaa-0000-4000-8000-000000000004";
export const CO_OWNER = "aaaaaaaa-0000-4000-8000-000000000005";
export const PARENT_OWNER = "aaaaaaaa-0000-4000-8000-000000000006";

/** What the fake store knows; each test edits a fresh copy. */
export type FakeWorld = {
  tokens: Record<string, string>;
  roles: Record<string, Array<CallerRole>>;
  activeTenant: Record<string, string | null>;
  emails: Record<string, string>;
  /** Each user's standing per organization, by `${tenant}:${user}`; "active" ones are their tenant_users rows. */
  memberships: Record<string, Membership>;
  /** Kept roles of inactive or deleted members, by `${tenant}:${user}`. */
  formerRoles: Record<string, Array<string>>;
  /** Each organization's parent. */
  parents: Record<string, string>;
  logins: Set<string>;
  offboard: OffboardResult | Error;
  failSignIn?: Error;
  failSoftDelete?: Error;
};

/**
 * Owner and co-owner of A, a campaigner in A only, a super admin acting in A,
 * B's owner, and the owner of P, A's parent organization.
 */
export function world(): FakeWorld {
  return {
    tokens: {
      "owner-token": OWNER,
      "member-token": MEMBER,
      "admin-token": ADMIN,
      "other-owner-token": OTHER_OWNER,
      "co-owner-token": CO_OWNER,
      "parent-owner-token": PARENT_OWNER,
    },
    roles: {
      [OWNER]: [{ role: "owner", tenant_id: TENANT_A }],
      [CO_OWNER]: [{ role: "owner", tenant_id: TENANT_A }],
      [MEMBER]: [{ role: "campaigner", tenant_id: TENANT_A }],
      [ADMIN]: [{ role: "super_admin", tenant_id: null }],
      [OTHER_OWNER]: [{ role: "owner", tenant_id: TENANT_B }],
      [PARENT_OWNER]: [{ role: "owner", tenant_id: PARENT }],
    },
    activeTenant: {
      [OWNER]: TENANT_A,
      [CO_OWNER]: TENANT_A,
      [MEMBER]: TENANT_A,
      [ADMIN]: TENANT_A,
      [OTHER_OWNER]: TENANT_B,
      [PARENT_OWNER]: PARENT,
    },
    emails: { "member@example.invalid": MEMBER },
    memberships: {
      [`${TENANT_A}:${OWNER}`]: "active",
      [`${TENANT_A}:${CO_OWNER}`]: "active",
      [`${TENANT_A}:${MEMBER}`]: "active",
      [`${TENANT_B}:${OTHER_OWNER}`]: "active",
      [`${PARENT}:${PARENT_OWNER}`]: "active",
    },
    formerRoles: {},
    parents: { [TENANT_A]: PARENT },
    logins: new Set([
      OWNER,
      CO_OWNER,
      MEMBER,
      ADMIN,
      OTHER_OWNER,
      PARENT_OWNER,
    ]),
    offboard: { remainingTenants: 0, accountDeleted: false },
  };
}

/** The store over `w`, and the writes it was asked for, in order. */
export function fakeStore(w: FakeWorld): {
  store: MemberAdminStore;
  writes: Array<string>;
} {
  const writes: Array<string> = [];
  const tenantRows = (userId: string) =>
    Object.entries(w.memberships)
      .filter(
        ([key, state]) => state === "active" && key.endsWith(`:${userId}`),
      )
      .map(([key]) => {
        const tenantId = key.split(":")[0];
        const owner = (w.roles[userId] ?? []).some(
          (r) => r.tenant_id === tenantId && r.role === "owner",
        );
        return { tenant_id: tenantId, role: owner ? "owner" : "member" };
      });
  const store: MemberAdminStore = {
    callerFromToken: async (token) => w.tokens[token] ?? null,
    rolesOf: async (userId) => w.roles[userId] ?? [],
    activeTenantOf: async (userId) => w.activeTenant[userId] ?? null,
    userIdByEmail: async (email) => w.emails[email] ?? null,
    membershipOf: async (tenantId, userId) =>
      w.memberships[`${tenantId}:${userId}`] ?? "none",
    membershipsOf: async (userId) => tenantRows(userId),
    formerRolesOf: async (tenantId, userId) =>
      w.formerRoles[`${tenantId}:${userId}`] ?? [],
    tenantParents: async () => new Map(Object.entries(w.parents)),
    authUserExists: async (userId) => w.logins.has(userId),
    activeTenantCount: async (userId) => tenantRows(userId).length,
    async offboard(tenantId, userId, actorId, status) {
      writes.push(`offboard ${tenantId} ${userId} by ${actorId} ${status}`);
      if (w.offboard instanceof Error) {
        throw w.offboard;
      }
      return w.offboard;
    },
    async reactivate(tenantId, userId, actorId) {
      writes.push(`reactivate ${tenantId} ${userId} by ${actorId}`);
    },
    async setSignInBlocked(userId, blocked) {
      writes.push(`sign-in ${blocked ? "blocked" : "allowed"} ${userId}`);
      if (w.failSignIn) {
        throw w.failSignIn;
      }
    },
    async softDeleteLogin(userId) {
      writes.push(`login soft-deleted ${userId}`);
      if (w.failSoftDelete) {
        throw w.failSoftDelete;
      }
    },
  };
  return { store, writes };
}
