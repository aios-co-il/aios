import { assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { runTenantDenied } from "./run-tenant-access.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const ADMIN = "44444444-4444-4444-8444-444444444444";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** MEMBER_A belongs to TENANT_A only, ADMIN is a super admin, AGENT_B is TENANT_B's Carmen. */
const db = () =>
  fakeSupabase(
    {
      tenant_users: [{ tenant_id: TENANT_A, user_id: MEMBER_A }],
      ai_agents: [{ id: AGENT_B, tenant_id: TENANT_B }],
    },
    { rpc: { is_super_admin: ({ _user_id }) => _user_id === ADMIN } },
  );

const user = (userId: string) => ({ kind: "user" as const, userId });

Deno.test("runTenantDenied", async (t) => {
  await t.step("refuses a user who names another tenant", async () => {
    const denied = await runTenantDenied(db(), user(MEMBER_A), {
      tenant_id: TENANT_B,
    });
    assertStrictEquals(denied, "Not a member of this organization");
  });

  await t.step(
    "refuses another tenant's agent without a tenant_id",
    async () => {
      const denied = await runTenantDenied(db(), user(MEMBER_A), {
        agent_id: AGENT_B,
      });
      assertStrictEquals(denied, "Not a member of this organization");
    },
  );

  await t.step(
    "refuses another tenant's agent under the user's own tenant",
    async () => {
      const denied = await runTenantDenied(db(), user(MEMBER_A), {
        tenant_id: TENANT_A,
        agent_id: AGENT_B,
      });
      assertStrictEquals(denied, "This agent belongs to another organization");
    },
  );

  await t.step("lets a member run in their own tenant", async () => {
    const denied = await runTenantDenied(db(), user(MEMBER_A), {
      tenant_id: TENANT_A,
    });
    assertStrictEquals(denied, null);
  });

  await t.step("lets a super admin run in any tenant", async () => {
    const denied = await runTenantDenied(db(), user(ADMIN), {
      tenant_id: TENANT_B,
    });
    assertStrictEquals(denied, null);
  });

  await t.step("leaves service calls as they were", async () => {
    const denied = await runTenantDenied(
      db(),
      { kind: "service", userId: null },
      { tenant_id: TENANT_B },
    );
    assertStrictEquals(denied, null);
  });
});
