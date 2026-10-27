import { assertRejects, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { staffAlertSender } from "./staff-alert-sender.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const AGENCY_USER = "66666666-6666-4666-8666-666666666666";
const SUPER = "77777777-7777-4777-8777-777777777777";
const LINE_USER = "44444444-4444-4444-8444-444444444444";
const OWNER = "55555555-5555-4555-8555-555555555555";

const LINE = { id: "manus-1", user_id: LINE_USER };
const LINE_WITHOUT_USER = { id: "manus-2", user_id: null };

/** The sender for `line` when `requesterUserId` asks, over a tenant with one member and an owner. */
async function senderOf(
  requesterUserId: string | null,
  line: { id: string; user_id: string | null } = LINE,
) {
  const supabase = fakeSupabase(
    {
      tenant_users: [{ tenant_id: TENANT, user_id: MEMBER }],
      user_roles: [{ tenant_id: TENANT, role: "owner", user_id: OWNER }],
    },
    { rpc: { is_super_admin: ({ _user_id }) => _user_id === SUPER } },
  );
  const senderFor = await staffAlertSender({
    supabase,
    tenantId: TENANT,
    requesterUserId,
  });
  return await senderFor(line);
}

Deno.test("staffAlertSender", async (t) => {
  await t.step(
    "a member or super admin requester sends as themself",
    async () => {
      assertStrictEquals(await senderOf(MEMBER), MEMBER);
      assertStrictEquals(await senderOf(SUPER), SUPER);
    },
  );

  await t.step(
    "an agency user who is not a member gives way to the line's user",
    async () => {
      // send-manus-wa-message would refuse AGENCY_USER on every line.
      assertStrictEquals(await senderOf(AGENCY_USER), LINE_USER);
    },
  );

  await t.step(
    "with no usable requester: the line's user, then the tenant owner",
    async () => {
      assertStrictEquals(await senderOf("system"), LINE_USER);
      assertStrictEquals(await senderOf(null, LINE_WITHOUT_USER), OWNER);
    },
  );

  await t.step("a failed membership lookup throws", async () => {
    const supabase = fakeSupabase({}, { failing: { tenant_users: "timeout" } });
    await assertRejects(() =>
      staffAlertSender({ supabase, tenantId: TENANT, requesterUserId: MEMBER }),
    );
  });
});
