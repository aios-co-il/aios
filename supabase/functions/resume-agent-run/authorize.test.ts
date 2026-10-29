import { assertEquals } from "jsr:@std/assert@1";
import { fakeDb } from "../_shared/carmen/approvals/test-db.ts";
import { authorizeRunDecision } from "./authorize.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ok = (data: unknown) => ({ data, error: null });
const owner = () => ok([{ role: "owner", tenant_id: "tenant-1" }]);
const step = (over = {}) => ({
  id: "row-1",
  tenant_id: "tenant-1",
  tool_name: "cancel_broadcast",
  requested_by: OWNER,
  status: "pending",
  run_id: "run-1",
  ...over,
});
const user = (userId: string) => ({ kind: "user" as const, userId });

Deno.test("authorizeRunDecision", async (t) => {
  await t.step(
    "another tenant's Carmen row reads as 404, not as a Carmen row",
    async () => {
      const { client } = fakeDb({
        user_roles: [ok([])],
        tenant_users: [ok([])],
      });
      const gate = await authorizeRunDecision(
        client,
        user(OTHER),
        step({ run_id: null }),
        "approved",
        null,
      );
      assertEquals(gate, {
        ok: false,
        status: 404,
        body: { ok: false, error: "approval_not_found" },
      });
    },
  );

  await t.step(
    "an approver of the tenant is sent to carmen-approval-execute",
    async () => {
      const { client } = fakeDb({
        user_roles: [owner()],
        tenant_users: [ok([])],
      });
      const gate = await authorizeRunDecision(
        client,
        user(OWNER),
        step({ run_id: null }),
        "approved",
        null,
      );
      assertEquals(gate, {
        ok: false,
        status: 409,
        body: { ok: false, error: "use_carmen_approval_execute" },
      });
    },
  );

  await t.step("a signed-in reviewer decides as themselves", async () => {
    const { client, calls } = fakeDb({
      user_roles: [owner()],
      tenant_users: [ok([])],
      agent_approval_queue: [ok([{ id: "row-1" }])],
    });
    const gate = await authorizeRunDecision(
      client,
      user(OWNER),
      step(),
      "rejected",
      OTHER,
    );
    assertEquals(gate, { ok: true, reviewerId: OWNER });
    const claim = calls.find(
      (c) => c[0] === "agent_approval_queue" && c[1] === "update",
    );
    assertEquals((claim?.[2] as { status: string }).status, "rejected");
  });

  await t.step("a decided row is not claimed again", async () => {
    const { client, calls } = fakeDb({
      user_roles: [owner()],
      tenant_users: [ok([])],
    });
    const gate = await authorizeRunDecision(
      client,
      user(OWNER),
      step({ status: "approved" }),
      "approved",
      null,
    );
    assertEquals(gate, {
      ok: false,
      status: 409,
      body: {
        ok: false,
        error: "approval already decided",
        status: "approved",
      },
    });
    assertEquals(
      calls.filter((c) => c[0] === "agent_approval_queue"),
      [],
    );
  });
});
