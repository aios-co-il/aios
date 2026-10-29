import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDb, rows } from "./fake-db.ts";
import { createAdScopeStore, createAdToolIdentity } from "./store.ts";

Deno.test(
  "createAdToolIdentity: user id, active tenant and super admin",
  async () => {
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
  },
);

Deno.test(
  "createAdToolIdentity: super-admin access follows the tenant flag",
  async () => {
    const on = fakeDb({ tenants: rows([{ allow_super_admin_access: true }]) });
    assertStrictEquals(
      await createAdToolIdentity(on).allowsSuperAdmin("t1"),
      true,
    );
    assertEquals(on.calls[0], {
      table: "tenants",
      ops: [
        ["select", "allow_super_admin_access"],
        ["eq", "id", "t1"],
      ],
    });
    const off = fakeDb({
      tenants: rows([{ allow_super_admin_access: false }]),
    });
    assertStrictEquals(
      await createAdToolIdentity(off).allowsSuperAdmin("t1"),
      false,
    );
    const missing = fakeDb({ tenants: rows([]) });
    assertStrictEquals(
      await createAdToolIdentity(missing).allowsSuperAdmin("t1"),
      false,
    );
    const broken = fakeDb({
      tenants: { data: null, error: new Error("boom") },
    });
    await assertRejects(() =>
      createAdToolIdentity(broken).allowsSuperAdmin("t1"),
    );
  },
);

Deno.test("createAdToolIdentity: roles need a tenant_users row", async () => {
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

Deno.test(
  "createAdToolIdentity: a database error is thrown, not read as no",
  async () => {
    const id = createAdToolIdentity(
      fakeDb({ tenant_users: { data: null, error: new Error("boom") } }),
    );
    await assertRejects(() => id.tenantRoles("u1", "t1"));
  },
);

Deno.test(
  "createAdScopeStore: shared agencies need read_write for writes",
  async () => {
    const db = fakeDb({ agency_tenant_access: rows([{ agency_id: "ag" }]) });
    const s = createAdScopeStore(db);
    assertEquals(await s.sharedAgencyIds("t1", "read"), ["ag"]);
    assertEquals(await s.sharedAgencyIds("t1", "write"), ["ag"]);
    assertEquals(db.calls[0].ops, [
      ["select", "agency_id"],
      ["eq", "accessing_tenant_id", "t1"],
    ]);
    assertEquals(db.calls[1].ops.at(-1), ["eq", "access_level", "read_write"]);
  },
);

Deno.test(
  "createAdScopeStore: Meta account links via clients and report tables",
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

Deno.test(
  "createAdScopeStore: Google customer links via clients and tables",
  async () => {
    const db = fakeDb({
      clients: rows([]),
      crm_tables: rows([{ client_id: "c9" }]),
    });
    const variants = ["1234567890", "123-456-7890"];
    const ids =
      await createAdScopeStore(db).clientIdsForGoogleCustomer(variants);
    assertEquals(ids, ["c9"]);
    assertEquals(db.calls[0].ops[1], ["in", "google_ads_account_id", variants]);
    assertEquals(db.calls[1].ops.at(-1), [
      "in",
      "integration_settings->>customer_id",
      variants,
    ]);
  },
);
