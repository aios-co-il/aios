import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  authorizePublishTarget,
  authorizeTenantPublisher,
  publishAccessLookups,
  type PublishAccessLookups,
  type PublishTarget,
  wordPressSiteScopeError,
} from "./tenant-publish-access.ts";

const TENANT = "tenant-a";
const members: Record<string, string[]> = {
  "member-a": [TENANT],
  "member-b": ["tenant-b"],
};
const superAdmins = new Set(["super"]);
const clientAccess: Record<string, string[]> = {
  "member-a": ["client-1"],
};

const calls: string[] = [];
const lookups: PublishAccessLookups = {
  isTenantMember: async (userId, tenantId) => {
    calls.push(`member:${userId}:${tenantId}`);
    return (members[userId] ?? []).includes(tenantId);
  },
  isSuperAdmin: async (userId) => {
    calls.push(`super:${userId}`);
    return superAdmins.has(userId);
  },
  canAccessClient: async (userId, clientId) => {
    calls.push(`client:${userId}:${clientId}`);
    return (clientAccess[userId] ?? []).includes(clientId);
  },
};

const user = (userId: string) => ({ kind: "user" as const, userId });
const service = { kind: "service" as const, userId: null };

Deno.test("no caller is refused with 401", async () => {
  const d = await authorizeTenantPublisher(null, TENANT, [], lookups);
  assertEquals(d, { allowed: false, status: 401, error: "Unauthorized" });
});

Deno.test("a user without an id is refused with 401", async () => {
  const d = await authorizeTenantPublisher(
    { kind: "user", userId: null },
    TENANT,
    [],
    lookups,
  );
  assertStrictEquals(!d.allowed && d.status, 401);
});

Deno.test(
  "service role is allowed for any tenant without lookups",
  async () => {
    calls.length = 0;
    const d = await authorizeTenantPublisher(
      service,
      "tenant-z",
      ["client-9"],
      lookups,
    );
    assertEquals(d, { allowed: true });
    assertEquals(calls, []);
  },
);

Deno.test("a member of the tenant is allowed", async () => {
  const d = await authorizeTenantPublisher(
    user("member-a"),
    TENANT,
    [],
    lookups,
  );
  assertEquals(d, { allowed: true });
});

Deno.test("a member of another tenant is refused with 403", async () => {
  const d = await authorizeTenantPublisher(
    user("member-b"),
    TENANT,
    [],
    lookups,
  );
  assertEquals(d, {
    allowed: false,
    status: 403,
    error: "Not a member of this tenant",
  });
});

Deno.test("a user with no tenant is refused with 403", async () => {
  const d = await authorizeTenantPublisher(user("member-a"), "", [], lookups);
  assertStrictEquals(!d.allowed && d.status, 403);
});

Deno.test("a super admin is allowed for any tenant and client", async () => {
  const d = await authorizeTenantPublisher(
    user("super"),
    "tenant-z",
    ["client-9"],
    lookups,
  );
  assertEquals(d, { allowed: true });
});

Deno.test("a member needs access to each named client", async () => {
  assertEquals(
    await authorizeTenantPublisher(
      user("member-a"),
      TENANT,
      ["client-1", null, "client-1", undefined],
      lookups,
    ),
    { allowed: true },
  );
  const d = await authorizeTenantPublisher(
    user("member-a"),
    TENANT,
    ["client-1", "client-2"],
    lookups,
  );
  assertEquals(d, {
    allowed: false,
    status: 403,
    error: "No access to this client",
  });
});

Deno.test("client checks are skipped for non-members", async () => {
  calls.length = 0;
  await authorizeTenantPublisher(user("member-b"), TENANT, ["client-1"], {
    ...lookups,
  });
  assert(!calls.some((c) => c.startsWith("client:")));
});

// publishAccessLookups against a fake service-role client.
function fakeDb(opts: {
  memberRow?: unknown;
  rpc?: Record<string, { data: unknown; error: unknown }>;
}) {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return builder;
    },
    maybeSingle: async () => ({ data: opts.memberRow ?? null, error: null }),
  };
  const rpcCalls: Array<[string, unknown]> = [];
  return {
    filters,
    rpcCalls,
    db: {
      from: (table: string) => {
        assertStrictEquals(table, "tenant_users");
        return builder;
      },
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push([fn, args]);
        return opts.rpc?.[fn] ?? { data: false, error: null };
      },
    },
  };
}

Deno.test("lookups query tenant_users and the access RPCs", async () => {
  const f = fakeDb({
    memberRow: { user_id: "u1" },
    rpc: {
      is_super_admin: { data: false, error: null },
      user_can_access_client: { data: true, error: null },
    },
  });
  const l = publishAccessLookups(f.db);
  assertStrictEquals(await l.isTenantMember("u1", TENANT), true);
  assertEquals(f.filters, [
    ["tenant_id", TENANT],
    ["user_id", "u1"],
  ]);
  assertStrictEquals(await l.isSuperAdmin("u1"), false);
  assertStrictEquals(await l.canAccessClient("u1", "client-1"), true);
  assertEquals(f.rpcCalls, [
    ["is_super_admin", { _user_id: "u1" }],
    ["user_can_access_client", { _user_id: "u1", _client_id: "client-1" }],
  ]);
});

Deno.test("a missing membership row is not membership", async () => {
  const l = publishAccessLookups(fakeDb({}).db);
  assertStrictEquals(await l.isTenantMember("u1", TENANT), false);
});

Deno.test("an RPC error throws instead of granting access", async () => {
  const l = publishAccessLookups(
    fakeDb({
      rpc: { is_super_admin: { data: true, error: new Error("boom") } },
    }).db,
  );
  await assertRejects(() => l.isSuperAdmin("u1"), Error, "boom");
});

// authorizePublishTarget for member-a, against a fake client that returns
// only the selected columns of `row`.
function publishTarget(
  row: Record<string, unknown> | null,
  table: PublishTarget["table"] = "seo_geo_calendar_entries",
  error: unknown = null,
) {
  let cols: string[] = [];
  const builder = {
    select: (s: string) => {
      cols = s.split(",").map((c) => c.trim());
      return builder;
    },
    eq: () => builder,
    maybeSingle: async () => ({
      data: row && Object.fromEntries(cols.map((c) => [c, row[c]])),
      error,
    }),
  };
  const db = { from: () => builder, rpc: fakeDb({}).db.rpc };
  return authorizePublishTarget(
    user("member-a"),
    db,
    { table, id: "1" },
    lookups,
  );
}

Deno.test("publishing a row needs access to the row's client", async () => {
  const row = { tenant_id: TENANT, client_id: "client-2" };
  assertEquals(await publishTarget(row), {
    allowed: false,
    status: 403,
    error: "No access to this client",
  });
  assertEquals(await publishTarget({ ...row, client_id: "client-1" }), {
    allowed: true,
    tenantId: TENANT,
  });
});

Deno.test("a missing row is 404 and a failed lookup throws", async () => {
  assertEquals(await publishTarget(null, "marketing_work_items"), {
    allowed: false,
    status: 404,
    error: "Work item not found",
  });
  const failed = () => publishTarget(null, undefined, new Error("db down"));
  await assertRejects(failed, Error, "db down");
});

Deno.test("WordPress site scope: same tenant and client is allowed", () => {
  assertStrictEquals(
    wordPressSiteScopeError(
      { tenant_id: TENANT, client_id: "client-1" },
      TENANT,
      "client-1",
    ),
    null,
  );
  assertStrictEquals(
    wordPressSiteScopeError(
      { tenant_id: TENANT, client_id: null },
      TENANT,
      "client-1",
    ),
    null,
  );
});

Deno.test("WordPress site scope: another tenant's site is refused", () => {
  assertStrictEquals(
    wordPressSiteScopeError(
      { tenant_id: "tenant-b", client_id: null },
      TENANT,
      "client-1",
    ),
    "WordPress site belongs to another tenant",
  );
});

Deno.test("WordPress site scope: another client's site is refused", () => {
  assertStrictEquals(
    wordPressSiteScopeError(
      { tenant_id: TENANT, client_id: "client-2" },
      TENANT,
      "client-1",
    ),
    "WordPress site belongs to another client",
  );
  assertStrictEquals(
    wordPressSiteScopeError(
      { tenant_id: TENANT, client_id: "client-2" },
      TENANT,
      null,
    ),
    "WordPress site belongs to another client",
  );
});
