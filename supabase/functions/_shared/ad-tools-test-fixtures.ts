/**
 * In-memory tenants, users, clients and Meta objects for the ad-tools auth
 * tests. No network, no database.
 *
 * Tenant A owns client cA. Tenant C owns cRW (agency shared with A read_write)
 * and cRO (agency shared with A read_only). Tenant B owns cB and has turned
 * super-admin access off.
 */
import type { AdToolIdentity } from "./ad-tools-auth.ts";
import type { AdScopeStore, ScopeClient } from "./ad-tools-scope.ts";

export const SERVICE = "service-role-key";
export const A = "tenant-a";
export const B = "tenant-b";

/** Client ids (clients.id is a uuid). */
export const CA = "00000000-0000-4000-8000-0000000000a1";
export const CB = "00000000-0000-4000-8000-0000000000b1";
export const CRW = "00000000-0000-4000-8000-0000000000c1";
export const CRO = "00000000-0000-4000-8000-0000000000c2";

/** Tenants with tenants.allow_super_admin_access = false. */
const NO_SUPER_ADMIN = new Set([B]);

function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.sig`;
}

export const ANON_KEY = fakeJwt({ role: "anon" });
export const FOREIGN_SERVICE_KEY = fakeJwt({ role: "service_role" });

type User = {
  id: string;
  active: string | null;
  /** tenant_users rows: tenant → role. */
  members: Record<string, string>;
  /** user_roles rows scoped to a tenant. */
  roles?: Record<string, string[]>;
  superAdmin?: boolean;
};

/** Bearer token → user. Tokens are user JWTs (role "authenticated"). */
export const USERS: Record<string, User> = {
  ownerA: { id: "u-owner-a", active: A, members: { [A]: "owner" } },
  agencyOwnerA: {
    id: "u-agency-owner-a",
    active: A,
    members: { [A]: "member" },
    roles: { [A]: ["agency_owner"] },
  },
  campaignerA: {
    id: "u-campaigner-a",
    active: A,
    members: { [A]: "member" },
    roles: { [A]: ["campaigner"] },
  },
  ownerB: { id: "u-owner-b", active: B, members: { [B]: "owner" } },
  // Set user_active_tenant to B without being a member of B.
  spoofer: { id: "u-spoofer", active: B, members: { [A]: "owner" } },
  superAdmin: { id: "u-super", active: A, members: {}, superAdmin: true },
  superAdminInB: {
    id: "u-super-b",
    active: B,
    members: {},
    superAdmin: true,
  },
};

export const tokenOf = (name: keyof typeof USERS) =>
  fakeJwt({ role: "authenticated", sub: USERS[name].id });

const userByToken = (token: string) =>
  Object.keys(USERS)
    .filter((name) => tokenOf(name) === token)
    .map((name) => USERS[name])[0] ?? null;
const userById = (id: string) => Object.values(USERS).find((u) => u.id === id)!;

export function identity(calls: string[] = []): AdToolIdentity {
  return {
    getUserId: async (token) => {
      calls.push("getUserId");
      return userByToken(token)?.id ?? null;
    },
    activeTenantId: async (id) => userById(id).active,
    tenantRoles: async (id, tenant) => {
      const u = userById(id);
      if (!(tenant in u.members)) return null;
      return [u.members[tenant], ...(u.roles?.[tenant] ?? [])];
    },
    isSuperAdmin: async (id) => !!userById(id).superAdmin,
    allowsSuperAdmin: async (tenant) => !NO_SUPER_ADMIN.has(tenant),
  };
}

const CLIENTS: (ScopeClient & { meta: string; google?: string })[] = [
  {
    id: CA,
    tenant_id: A,
    agency_id: "ag-a",
    meta: "111",
    google: "1112223333",
  },
  {
    id: CB,
    tenant_id: B,
    agency_id: "ag-b",
    meta: "222",
    google: "2223334444",
  },
  {
    id: CRW,
    tenant_id: "tenant-c",
    agency_id: "ag-rw",
    meta: "333",
    google: "3334445555",
  },
  { id: CRO, tenant_id: "tenant-c", agency_id: "ag-ro", meta: "444" },
];
const SHARES = [
  { agency_id: "ag-rw", accessing_tenant_id: A, access_level: "read_write" },
  { agency_id: "ag-ro", accessing_tenant_id: A, access_level: "read_only" },
];

export function store(): AdScopeStore {
  return {
    clientsByIds: async (ids) =>
      CLIENTS.filter((c) => ids.includes(c.id)).map(
        ({ id, tenant_id, agency_id }) => ({ id, tenant_id, agency_id }),
      ),
    clientIdsForMetaAccount: async (variants) =>
      CLIENTS.filter((c) => variants.includes(c.meta)).map((c) => c.id),
    clientIdsForGoogleCustomer: async (variants) =>
      CLIENTS.filter((c) => c.google && variants.includes(c.google)).map(
        (c) => c.id,
      ),
    sharedAgencyIds: async (tenant, access) =>
      SHARES.filter(
        (s) =>
          s.accessing_tenant_id === tenant &&
          (access === "read" || s.access_level === "read_write"),
      ).map((s) => s.agency_id),
  };
}

/** Meta campaign id → ad account, as the Graph API would answer. */
export const META_OBJECTS: Record<string, string> = {
  "9001": "act_111", // cA
  "9002": "222", // cB
  "9003": "333", // cRW (shared read_write)
  "9004": "444", // cRO (shared read_only)
  "9005": "555", // not linked to any client
};
