import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { callerMayUseTenant } from "./caller-access.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const SUPER = "44444444-4444-4444-8444-444444444444";

/** MEMBER belongs to TENANT only; SUPER is a super admin. */
function db(failing: Record<string, string> = {}) {
  return fakeSupabase(
    { tenant_users: [{ tenant_id: TENANT, user_id: MEMBER }] },
    { failing, rpc: { is_super_admin: ({ _user_id }) => _user_id === SUPER } },
  );
}

Deno.test("callerMayUseTenant", async (t) => {
  await t.step("a member may summarize for their tenant", async () => {
    assertEquals(await callerMayUseTenant(db(), TENANT, MEMBER), true);
  });

  await t.step("a member naming another tenant is refused", async () => {
    assertEquals(await callerMayUseTenant(db(), OTHER, MEMBER), false);
  });

  await t.step("a super admin may summarize for any tenant", async () => {
    assertEquals(await callerMayUseTenant(db(), OTHER, SUPER), true);
  });

  await t.step("a missing tenant or a failed lookup is refused", async () => {
    assertEquals(await callerMayUseTenant(db(), undefined, MEMBER), false);
    assertEquals(
      await callerMayUseTenant(db({ tenant_users: "down" }), TENANT, MEMBER),
      false,
    );
  });
});
