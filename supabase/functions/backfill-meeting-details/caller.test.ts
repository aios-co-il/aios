import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { userMayRunBackfill } from "./caller.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const CAMPAIGNER = "44444444-4444-4444-8444-444444444444";
const SUPER = "55555555-5555-4555-8555-555555555555";

/** OWNER owns TENANT, CAMPAIGNER is a campaigner there, SUPER is a super admin. */
function db(failing: Record<string, string> = {}) {
  return fakeSupabase(
    {
      user_roles: [
        { tenant_id: TENANT, user_id: OWNER, role: "owner" },
        { tenant_id: TENANT, user_id: CAMPAIGNER, role: "campaigner" },
      ],
    },
    { failing, rpc: { is_super_admin: ({ _user_id }) => _user_id === SUPER } },
  );
}

Deno.test("userMayRunBackfill", async (t) => {
  await t.step("an owner of the tenant may run it", async () => {
    assertEquals(await userMayRunBackfill(db(), TENANT, OWNER), true);
  });

  await t.step("a campaigner of the tenant may not", async () => {
    assertEquals(await userMayRunBackfill(db(), TENANT, CAMPAIGNER), false);
  });

  await t.step("an owner of another tenant may not", async () => {
    assertEquals(await userMayRunBackfill(db(), OTHER, OWNER), false);
  });

  await t.step("a super admin may run it for any tenant", async () => {
    assertEquals(await userMayRunBackfill(db(), OTHER, SUPER), true);
  });

  await t.step("a failed role lookup is an error, not a yes", async () => {
    await assertRejects(
      () => userMayRunBackfill(db({ user_roles: "down" }), TENANT, CAMPAIGNER),
      Error,
      "user_roles lookup failed",
    );
  });
});
