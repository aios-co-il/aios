import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { fakeSupabase } from "../testing/fake-supabase.ts";
import {
  mayUseLine,
  tenantCanUseIntegration,
  tenantUserAccess,
} from "./tenant-access.ts";

const TENANT = "t1";
const OTHER = "t2";

/** u1 is a member of t1, admin is a super admin, line-b of t2 is shared with t1. */
const db = () =>
  fakeSupabase(
    { tenant_users: [{ tenant_id: TENANT, user_id: "u1" }] },
    {
      rpc: {
        is_super_admin: ({ _user_id }) => _user_id === "admin",
        tenant_can_use_integration: ({ p_tenant_id, p_integration_id }) =>
          p_tenant_id === TENANT && p_integration_id === "line-b",
      },
    },
  );

Deno.test("tenantUserAccess", async (t) => {
  await t.step("reads membership and super-admin status", async () => {
    const sb = db();
    assertEquals(await tenantUserAccess(sb, TENANT, "u1"), {
      member: true,
      superAdmin: false,
    });
    assertEquals(await tenantUserAccess(sb, OTHER, "u1"), {
      member: false,
      superAdmin: false,
    });
    assertEquals(await tenantUserAccess(sb, TENANT, "admin"), {
      member: false,
      superAdmin: true,
    });
  });

  await t.step("no tenant is no membership, without a query", async () => {
    const sb = db();
    assertStrictEquals((await tenantUserAccess(sb, "", "u1")).member, false);
    assertStrictEquals(
      sb.queries.some((q) => q.table === "tenant_users"),
      false,
    );
  });

  await t.step("a failed lookup throws instead of reading as no", async () => {
    for (const failing of ["tenant_users", "is_super_admin"]) {
      const sb = fakeSupabase({}, { failing: { [failing]: "timeout" } });
      await assertRejects(() => tenantUserAccess(sb, TENANT, "u1"));
    }
  });
});

Deno.test("mayUseLine", async (t) => {
  const member = { member: true, superAdmin: false };

  await t.step(
    "the tenant's own line, or another tenant's only when shared",
    async () => {
      const sb = db();
      const own = { id: "line-a", tenant_id: TENANT };
      const shared = { id: "line-b", tenant_id: OTHER };
      const unshared = { id: "line-c", tenant_id: OTHER };
      assertStrictEquals(await mayUseLine(sb, TENANT, member, own), true);
      assertStrictEquals(await mayUseLine(sb, TENANT, member, shared), true);
      assertStrictEquals(await mayUseLine(sb, TENANT, member, unshared), false);
    },
  );

  await t.step("a super admin may use any line", async () => {
    const line = { id: "line-c", tenant_id: OTHER };
    const admin = { member: false, superAdmin: true };
    assertStrictEquals(await mayUseLine(db(), TENANT, admin, line), true);
  });
});

Deno.test("tenantCanUseIntegration", async (t) => {
  await t.step("a failed lookup throws", async () => {
    const sb = fakeSupabase(
      {},
      { failing: { tenant_can_use_integration: "timeout" } },
    );
    await assertRejects(() => tenantCanUseIntegration(sb, TENANT, "line-b"));
  });
});
