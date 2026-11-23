import { assertEquals, assert } from "jsr:@std/assert@1";
import { dispatchAccountingTool } from "./accounting-dispatch.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "production accounting dispatcher queues each alias with its original name",
  async () => {
    for (const name of [
      "create_one_time_income",
      "delete_one_time_income",
      "record_income_payment",
      "delete_income_payment",
      "record_expense_payment",
      "delete_expense_payment",
      "update_client_retainer",
    ]) {
      const fixture = executorClient([{ id: "approval" }], 200, {
        actorUserId: "user",
        agentId: "agent",
      });
      const args = { amount: 125, payment_month: "2026-11" };
      const dispatched = await dispatchAccountingTool(
        name,
        args,
        fixture.context,
      );
      assert(dispatched);
      assertEquals(dispatched.result.pending_approval, true);
      assertEquals(dispatched.result.action, name);
      assertEquals(fixture.calls.length, 1);
      assertEquals(
        new URL(fixture.calls[0].url).pathname,
        "/rest/v1/agent_approval_queue",
      );
      const body = fixture.calls[0].body as {
        tool_name: string;
        tool_input: unknown;
        requested_by: string;
        status: string;
      };
      assertEquals(body.tool_name, name);
      assertEquals(body.tool_input, args);
      assertEquals(body.requested_by, "user");
      assertEquals(body.status, "pending");
    }
  },
);

Deno.test("non-accounting tools fall through without requests", async () => {
  const fixture = executorClient([]);
  assertEquals(
    await dispatchAccountingTool("list_finance", {}, fixture.context),
    null,
  );
  assertEquals(fixture.calls.length, 0);
});
