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
export const OWNER = "aaaaaaaa-0000-4000-8000-000000000001";
export const MEMBER = "aaaaaaaa-0000-4000-8000-000000000002";
export const ADMIN = "aaaaaaaa-0000-4000-8000-000000000003";
export const OTHER_OWNER = "aaaaaaaa-0000-4000-8000-000000000004";

/** What the fake store knows; each test edits a fresh copy. */
export type FakeWorld = {
  tokens: Record<string, string>;
  roles: Record<string, Array<CallerRole>>;
  activeTenant: Record<string, string | null>;
  emails: Record<string, string>;
  memberships: Record<string, Membership>;
  logins: Set<string>;
  /** tenant_users rows per user, as activeTenantCount reads them. */
  activeTenants: Record<string, number>;
  offboard: OffboardResult | Error;
  failSignIn?: Error;
  failSoftDelete?: Error;
};

/** Owner of A, a campaigner in A only, a super admin acting in A, and B's owner. */
export function world(): FakeWorld {
  return {
    tokens: {
      "owner-token": OWNER,
      "member-token": MEMBER,
      "admin-token": ADMIN,
      "other-owner-token": OTHER_OWNER,
    },
    roles: {
      [OWNER]: [{ role: "owner", tenant_id: TENANT_A }],
      [MEMBER]: [{ role: "campaigner", tenant_id: TENANT_A }],
      [ADMIN]: [{ role: "super_admin", tenant_id: null }],
      [OTHER_OWNER]: [{ role: "owner", tenant_id: TENANT_B }],
    },
    activeTenant: {
      [OWNER]: TENANT_A,
      [MEMBER]: TENANT_A,
      [ADMIN]: TENANT_A,
      [OTHER_OWNER]: TENANT_B,
    },
    emails: { "member@example.invalid": MEMBER },
    memberships: {
      [`${TENANT_A}:${OWNER}`]: "active",
      [`${TENANT_A}:${MEMBER}`]: "active",
      [`${TENANT_B}:${OTHER_OWNER}`]: "active",
    },
    logins: new Set([OWNER, MEMBER, ADMIN, OTHER_OWNER]),
    activeTenants: { [OWNER]: 1, [MEMBER]: 1, [OTHER_OWNER]: 1 },
    offboard: { remainingTenants: 0, accountDeleted: false },
  };
}

/** The store over `w`, and the writes it was asked for, in order. */
export function fakeStore(w: FakeWorld): {
  store: MemberAdminStore;
  writes: Array<string>;
} {
  const writes: Array<string> = [];
  const store: MemberAdminStore = {
    callerFromToken: async (token) => w.tokens[token] ?? null,
    rolesOf: async (userId) => w.roles[userId] ?? [],
    activeTenantOf: async (userId) => w.activeTenant[userId] ?? null,
    userIdByEmail: async (email) => w.emails[email] ?? null,
    membershipOf: async (tenantId, userId) =>
      w.memberships[`${tenantId}:${userId}`] ?? "none",
    authUserExists: async (userId) => w.logins.has(userId),
    activeTenantCount: async (userId) => w.activeTenants[userId] ?? 0,
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
