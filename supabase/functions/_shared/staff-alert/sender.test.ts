import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { fakeSupabase } from "../testing/fake-supabase.ts";
import { staffAlertSender } from "./sender.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const AGENCY_USER = "66666666-6666-4666-8666-666666666666";
const SUPER = "77777777-7777-4777-8777-777777777777";
const LINE_USER = "44444444-4444-4444-8444-444444444444";
const OWNER = "55555555-5555-4555-8555-555555555555";

const LINE = { id: "manus-1", user_id: LINE_USER };
const LINE_WITHOUT_USER = { id: "manus-2", user_id: null };
/** A line whose user (AGENCY_USER) is not a member of the tenant. */
const LINE_OF_OUTSIDER = { id: "manus-3", user_id: AGENCY_USER };

/** A tenant whose members are MEMBER, LINE_USER and its owner OWNER; SUPER is a super admin. */
function db(members = [MEMBER, LINE_USER, OWNER]) {
  return fakeSupabase(
    {
      tenant_users: members.map((user_id) => ({ tenant_id: TENANT, user_id })),
      user_roles: [{ tenant_id: TENANT, role: "owner", user_id: OWNER }],
    },
    { rpc: { is_super_admin: ({ _user_id }) => _user_id === SUPER } },
  );
}

/** The sender for `line` when `requesterUserId` asks. */
async function senderOf(
  requesterUserId: string | null,
  line: { id: string; user_id: string | null } = LINE,
  supabase = db(),
) {
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

  await t.step(
    "a line user who is not a member gives way to the owner",
    async () => {
      assertStrictEquals(await senderOf(null, LINE_OF_OUTSIDER), OWNER);
    },
  );

  await t.step(
    "no one send-manus-wa-message would accept is no sender",
    async () => {
      assertStrictEquals(
        await senderOf(AGENCY_USER, LINE_OF_OUTSIDER, db([])),
        null,
      );
    },
  );

  await t.step("each user is looked up once across lines", async () => {
    const supabase = db();
    const senderFor = await staffAlertSender({
      supabase,
      tenantId: TENANT,
      requesterUserId: AGENCY_USER,
    });
    assertEquals(
      [await senderFor(LINE), await senderFor(LINE)],
      [LINE_USER, LINE_USER],
    );
    const lookups = supabase.queries.filter((q) => q.table === "tenant_users");
    assertStrictEquals(lookups.length, 2);
  });

  await t.step("a failed membership lookup throws", async () => {
    const supabase = fakeSupabase({}, { failing: { tenant_users: "timeout" } });
    await assertRejects(() =>
      staffAlertSender({ supabase, tenantId: TENANT, requesterUserId: MEMBER }),
    );
  });
});
