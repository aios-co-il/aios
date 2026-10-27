import { assertEquals } from "jsr:@std/assert@1";
import { fakeDb } from "../../_shared/carmen/approvals/test-db.ts";
import { loadApprovalPick } from "./pick.ts";
import { DAVID, ID1, row } from "./test-fixtures.ts";

const TENANT = "tenant-1";
const ok = (data: unknown) => ({ data, error: null });

/** David's own fb_pause request in conversation c-1, five minutes ago. */
const pending = row(ID1, {
  created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
  context: { conversation_key: "conv:c-1" },
});

/** loadApprovalPick for David's bare "כן" in c-1, with his user_roles rows. */
function pickWithRoles(roleRows: Array<{ role: string; tenant_id: string }>) {
  const { client, calls } = fakeDb({
    agent_approval_queue: [ok([pending])],
    user_roles: [ok(roleRows)],
    tenant_users: [ok([])],
  });
  const pick = loadApprovalPick(client, TENANT, {
    userId: DAVID,
    conversationId: "c-1",
  });
  return { pick, calls };
}

Deno.test("loadApprovalPick", async (t) => {
  await t.step(
    "an owner role in another tenant does not approve a money row here",
    async () => {
      const { pick, calls } = pickWithRoles([
        { role: "campaigner", tenant_id: TENANT },
      ]);
      assertEquals((await pick).kind, "forbidden");
      assertEquals(
        calls.find(
          ([table, method]) => table === "user_roles" && method === "or",
        ),
        ["user_roles", "or", `tenant_id.eq.${TENANT},tenant_id.is.null`],
      );
    },
  );

  await t.step("an owner of this tenant approves it", async () => {
    const { pick } = pickWithRoles([{ role: "owner", tenant_id: TENANT }]);
    assertEquals((await pick).kind, "match");
  });
});
