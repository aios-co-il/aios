import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { createAdScopeStore, createAdToolIdentity } from "./ad-tools-store.ts";

type Result = { data: unknown; error: unknown };
type Call = { table: string; ops: unknown[][] };

/** Chainable stand-in for supabase-js: records filters, answers per table. */
function fakeDb(
  tables: Record<string, Result>,
  rpcs: Record<string, Result> = {},
) {
  const calls: Call[] = [];
  return {
    calls,
    auth: {
      getUser: async (token: string) =>
        token === "good"
          ? { data: { user: { id: "u1" } }, error: null }
          : { data: { user: null }, error: new Error("invalid JWT") },
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push({ table: `rpc:${fn}`, ops: [[args]] });
      return rpcs[fn] ?? { data: null, error: null };
    },
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const q: Record<string, unknown> = {
        then: (ok: (r: Result) => unknown, fail: (e: unknown) => unknown) =>
          Promise.resolve(tables[table] ?? { data: [], error: null }).then(
            ok,
            fail,
          ),
      };
      for (const m of ["select", "eq", "in", "not", "or"])
        q[m] = (...args: unknown[]) => (call.ops.push([m, ...args]), q);
      return q;
    },
  };
}

const rows = (data: unknown[]) => ({ data, error: null });

Deno.test("identity: user id, active tenant and super admin", async () => {
  const db = fakeDb(
    {},
    {
      get_user_tenant_id: { data: "t1", error: null },
      is_super_admin: { data: true, error: null },
    },
  );
  const id = createAdToolIdentity(db);
  assertStrictEquals(await id.getUserId("good"), "u1");
  assertStrictEquals(await id.getUserId("anon"), null);
  assertStrictEquals(await id.activeTenantId("u1"), "t1");
  assertStrictEquals(await id.isSuperAdmin("u1"), true);
});

Deno.test("identity: roles need a tenant_users row", async () => {
  const member = createAdToolIdentity(
    fakeDb({
      tenant_users: rows([{ role: "member" }]),
      user_roles: rows([{ role: "agency_owner" }]),
    }),
  );
  assertEquals(await member.tenantRoles("u1", "t1"), [
    "member",
    "agency_owner",
  ]);
  const outsider = createAdToolIdentity(
    fakeDb({ tenant_users: rows([]), user_roles: rows([{ role: "owner" }]) }),
  );
  assertStrictEquals(await outsider.tenantRoles("u1", "t1"), null);
});

Deno.test("identity: a database error is thrown, not read as no", async () => {
  const id = createAdToolIdentity(
    fakeDb({ tenant_users: { data: null, error: new Error("boom") } }),
  );
  await assertRejects(() => id.tenantRoles("u1", "t1"));
});

Deno.test("store: shared agencies need read_write for writes", async () => {
  const db = fakeDb({ agency_tenant_access: rows([{ agency_id: "ag" }]) });
  const s = createAdScopeStore(db);
  assertEquals(await s.sharedAgencyIds("t1", "read"), ["ag"]);
  assertEquals(await s.sharedAgencyIds("t1", "write"), ["ag"]);
  assertEquals(db.calls[0].ops, [
    ["select", "agency_id"],
    ["eq", "accessing_tenant_id", "t1"],
  ]);
  assertEquals(db.calls[1].ops.at(-1), ["eq", "access_level", "read_write"]);
});

Deno.test(
  "store: Meta account links via clients and report tables",
  async () => {
    const db = fakeDb({
      clients: rows([{ id: "c1" }]),
      crm_tables: rows([{ client_id: "c2" }]),
    });
    const ids = await createAdScopeStore(db).clientIdsForMetaAccount([
      "123",
      "act_123",
    ]);
    assertEquals(ids, ["c1", "c2"]);
    assertEquals(db.calls[0].ops[1], [
      "in",
      "meta_ads_account_id",
      ["123", "act_123"],
    ]);
    assertEquals(
      db.calls[1].ops.find((op) => op[0] === "or"),
      [
        "or",
        "integration_settings->>ad_account_id.in.(123,act_123)," +
          "integration_settings->>account_id.in.(123,act_123)," +
          "integration_settings->>meta_account_id.in.(123,act_123)",
      ],
    );
  },
);

Deno.test("store: Google customer links via clients and tables", async () => {
  const db = fakeDb({
    clients: rows([]),
    crm_tables: rows([{ client_id: "c9" }]),
  });
  const variants = ["1234567890", "123-456-7890"];
  const ids = await createAdScopeStore(db).clientIdsForGoogleCustomer(variants);
  assertEquals(ids, ["c9"]);
  assertEquals(db.calls[0].ops[1], ["in", "google_ads_account_id", variants]);
  assertEquals(db.calls[1].ops.at(-1), [
    "in",
    "integration_settings->>customer_id",
    variants,
  ]);
});
