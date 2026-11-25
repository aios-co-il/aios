import { assertEquals } from "jsr:@std/assert@1";
import { executeExecutePendingApproval } from "./execute-pending-approval.ts";
import { executorClient } from "./executor-client.test-fixture.ts";
import { row, ID1, ID2 } from "../approvals/test-fixtures.ts";

for (const approval_id of ["not-a-uuid", "1234", "   "]) {
  Deno.test(
    `explicit malformed approval ${JSON.stringify(approval_id)} cannot execute the bound request`,
    async () => {
      const scenario = await approvalScenario(approval_id);
      assertEquals(scenario.result.success, false);
      assertEquals(scenario.result.claim_execution, false);
      assertEquals(scenario.result.error, "approval_not_bound");
      assertEquals(scenario.dbCalls, []);
      assertEquals(scenario.executions, []);
    },
  );
}

for (const approval_id of [undefined, "", ID1]) {
  Deno.test(
    `bound approval retains execution for ${JSON.stringify(approval_id)}`,
    async () => {
      const scenario = await approvalScenario(approval_id);
      assertEquals(scenario.result.success, true);
      assertEquals(scenario.result.claim_execution, true);
      assertEquals(scenario.executions.length, 1);
      assertEquals(scenario.executions[0], {
        approval_id: ID1,
        approved_by: "11111111-1111-4111-8111-111111111111",
      });
    },
  );
}

Deno.test(
  "a different valid approval ID still refuses the bound request",
  async () => {
    const scenario = await approvalScenario(ID2);
    assertEquals(scenario.result.success, false);
    assertEquals(scenario.result.error, "approval_not_bound");
    assertEquals(scenario.executions, []);
  },
);

/** Exercise the real picker and executor HTTP boundary without external writes. */
async function approvalScenario(approval_id?: string) {
  const actor = "11111111-1111-4111-8111-111111111111";
  const pending = row(ID1, {
    requested_by: actor,
    created_at: new Date().toISOString(),
    expires_at: null,
    context: { conversation_key: "conv:conversation" },
  });
  const fixture = executorClient(
    [],
    200,
    { actorUserId: actor, conversationId: "conversation" },
    undefined,
    (url) => {
      if (url.pathname.endsWith("/agent_approval_queue")) {
        return [pending];
      }
      if (url.pathname.endsWith("/user_roles")) {
        return [{ role: "owner", tenant_id: "t1" }];
      }
      if (url.pathname.endsWith("/tenant_users")) {
        return [{ id: "membership" }];
      }
      throw new Error("Unexpected picker request");
    },
  );
  const executions: Array<unknown> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    if (typeof init?.body !== "string") {
      throw new Error("Expected approval body");
    }
    executions.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const result = await executeExecutePendingApproval(
      approval_id === undefined ? {} : { approval_id },
      fixture.context,
    );
    return { result, dbCalls: fixture.calls, executions };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
