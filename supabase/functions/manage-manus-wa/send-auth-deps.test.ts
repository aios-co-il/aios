import { assertRejects, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { manusSendAuthDeps } from "./send-auth-deps.ts";

Deno.test("manusSendAuthDeps", async (t) => {
  await t.step("reads membership and super-admin status", async () => {
    const deps = manusSendAuthDeps(
      fakeSupabase(
        { tenant_users: [{ tenant_id: "t1", user_id: "u1" }] },
        { rpc: { is_super_admin: ({ _user_id }) => _user_id === "admin" } },
      ),
    );
    assertStrictEquals(await deps.isTenantMember("t1", "u1"), true);
    assertStrictEquals(await deps.isTenantMember("t2", "u1"), false);
    assertStrictEquals(await deps.isSuperAdmin("admin"), true);
    assertStrictEquals(await deps.isSuperAdmin("u1"), false);
  });

  await t.step(
    "a failed lookup throws instead of reading as not a member",
    async () => {
      const deps = manusSendAuthDeps(
        fakeSupabase(
          {},
          {
            failing: {
              tenant_users: "timeout",
              is_super_admin: "timeout",
              tenant_can_use_integration: "timeout",
            },
          },
        ),
      );
      await assertRejects(() => deps.isTenantMember("t1", "u1"));
      await assertRejects(() => deps.isSuperAdmin("u1"));
      await assertRejects(() => deps.tenantCanUseIntegration("t1", "manus-a"));
    },
  );
});
