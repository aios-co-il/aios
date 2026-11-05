import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { fakeSupabase } from "../testing/fake-supabase.ts";
import {
  isSuperAdminUser,
  mayUseLine,
  tenantCanUseIntegration,
  tenantUserAccess,
} from "./tenant-access.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const ADMIN = "44444444-4444-4444-8444-444444444444";
const LINE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LINE_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** MEMBER is a member of TENANT, ADMIN is a super admin, LINE_B of OTHER is shared with TENANT. */
const db = (failing: Record<string, string> = {}) =>
  fakeSupabase(
    { tenant_users: [{ tenant_id: TENANT, user_id: MEMBER }] },
    {
      failing,
      rpc: {
        is_super_admin: ({ _user_id }) => _user_id === ADMIN,
        tenant_can_use_integration: ({ p_tenant_id, p_integration_id }) =>
          p_tenant_id === TENANT && p_integration_id === LINE_B,
      },
    },
  );

Deno.test("tenantUserAccess", async (t) => {
  await t.step("reads membership and super-admin status", async () => {
    const sb = db();
    assertEquals(await tenantUserAccess(sb, TENANT, MEMBER), {
      member: true,
      superAdmin: false,
    });
    assertEquals(await tenantUserAccess(sb, OTHER, MEMBER), {
      member: false,
      superAdmin: false,
    });
    assertEquals(await tenantUserAccess(sb, TENANT, ADMIN), {
      member: false,
      superAdmin: true,
    });
  });

  await t.step(
    "no tenant, or an id that is not a uuid, matches nothing without a query",
    async () => {
      const sb = db({ tenant_users: "invalid uuid", is_super_admin: "boom" });
      assertEquals(await tenantUserAccess(sb, "", "system"), {
        member: false,
        superAdmin: false,
      });
      assertEquals(await tenantUserAccess(sb, "not-a-tenant", "system"), {
        member: false,
        superAdmin: false,
      });
      assertEquals(sb.queries, []);
    },
  );

  await t.step(
    "a failed lookup throws an Error that names it, instead of reading as no",
    async () => {
      await assertRejects(
        () => tenantUserAccess(db({ tenant_users: "timeout" }), TENANT, MEMBER),
        Error,
        "tenant_users lookup failed: timeout",
      );
      // The RPC error is a plain PostgREST object; its text must survive.
      await assertRejects(
        () =>
          tenantUserAccess(db({ is_super_admin: "timeout" }), TENANT, MEMBER),
        Error,
        "is_super_admin failed: timeout",
      );
    },
  );
});

Deno.test("isSuperAdminUser", async (t) => {
  await t.step(
    "a user id that is not a uuid is not a super admin",
    async () => {
      assertStrictEquals(
        await isSuperAdminUser(db({ is_super_admin: "boom" }), "system"),
        false,
      );
    },
  );
});

Deno.test("mayUseLine", async (t) => {
  const member = { member: true, superAdmin: false };

  await t.step(
    "the tenant's own line, or another tenant's only when shared",
    async () => {
      const sb = db();
      const own = { id: LINE_A, tenant_id: TENANT };
      const shared = { id: LINE_B, tenant_id: OTHER };
      const unshared = { id: LINE_C, tenant_id: OTHER };
      assertStrictEquals(await mayUseLine(sb, TENANT, member, own), true);
      assertStrictEquals(await mayUseLine(sb, TENANT, member, shared), true);
      assertStrictEquals(await mayUseLine(sb, TENANT, member, unshared), false);
    },
  );

  await t.step("a super admin may use any line", async () => {
    const line = { id: LINE_C, tenant_id: OTHER };
    const admin = { member: false, superAdmin: true };
    assertStrictEquals(await mayUseLine(db(), TENANT, admin, line), true);
  });
});

Deno.test("tenantCanUseIntegration", async (t) => {
  await t.step("a failed lookup throws", async () => {
    await assertRejects(
      () =>
        tenantCanUseIntegration(
          db({ tenant_can_use_integration: "timeout" }),
          TENANT,
          LINE_B,
        ),
      Error,
      "tenant_can_use_integration failed: timeout",
    );
  });

  await t.step(
    "an id that is not a uuid names no line, without a query",
    async () => {
      const sb = db({ tenant_can_use_integration: "invalid input syntax" });
      assertStrictEquals(
        await tenantCanUseIntegration(sb, TENANT, "manus-1"),
        false,
      );
    },
  );
});
