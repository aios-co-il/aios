import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import contract from "./route-contract.json" with { type: "json" };
import { TOOL_ROUTES } from "./registry.ts";
import { executeWithContext } from "./dispatch.ts";
import { createChatReadContext } from "./chat-context.ts";
import { executorClient } from "../executors/executor-client.test-fixture.ts";

/** No recursive call is expected from these ordinary and unknown routes. */
async function noRecursiveTool() {
  throw new Error("unexpected recursive tool");
}

Deno.test("domain registries retain every legacy switch key", () => {
  assertEquals(Object.keys(TOOL_ROUTES).sort(), Object.keys(contract).sort());
  assertEquals(Object.keys(TOOL_ROUTES).length, 204);
});

Deno.test(
  "prototype and coerced keys retain the legacy unknown-tool rejection",
  async () => {
    for (const name of ["constructor", "__proto__", ["list_clients"]]) {
      const fixture = executorClient([]);
      await assertRejects(
        async () => {
          await executeWithContext(
            {},
            { ...fixture.context, name: name as string },
            noRecursiveTool,
          );
        },
        Error,
        "Unknown tool:",
      );
      assertEquals(fixture.calls, []);
    }
  },
);

Deno.test(
  "accounting aliases preserve their action and only enqueue approval",
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
      const fixture = executorClient([{ id: "approval" }], 200, { name });
      const result = (await executeWithContext(
        { amount: 25 },
        fixture.context,
        noRecursiveTool,
      )) as { pending_approval: boolean; action: string };
      assertEquals([result.pending_approval, result.action], [true, name]);
      assertEquals(fixture.calls.length, 1);
      assertEquals(
        new URL(fixture.calls[0].url).pathname,
        "/rest/v1/agent_approval_queue",
      );
      const body = fixture.calls[0].body as {
        action_type: string;
        tool_input: unknown;
      };
      assertEquals(body.action_type, name);
      assertEquals(body.tool_input, { amount: 25 });
    }
  },
);

Deno.test(
  "chat scope input comes from the verified actor rather than role flags",
  () => {
    const fixture = executorClient([], 200, {
      actorUserId: "actor",
      userId: "unresolved",
      callerCampaignerId: "staff",
      callerRole: "owner",
    });
    const { scopeInput } = createChatReadContext(fixture.context);
    assertEquals(scopeInput, {
      tenantId: "t1",
      accessibleTenantIds: ["t1", "shared"],
      userId: "actor",
      callerCampaignerId: "staff",
      waNotify: undefined,
    });
  },
);

Deno.test(
  "named routes reach the intended scoped query and preserve their result shape",
  async (t) => {
    const cases: Array<{
      name: string;
      args: Record<string, unknown>;
      table: string;
      filters: Record<string, string>;
      expected: unknown;
    }> = [
      {
        name: "list_agents",
        args: { only_active: true },
        table: "ai_agents",
        filters: {
          tenant_id: "in.(t1,shared)",
          active: "eq.true",
          order: "name.asc",
        },
        expected: { count: 0, agents: [] },
      },
      {
        name: "list_tasks",
        args: { status: "open", limit: 3 },
        table: "tasks",
        filters: {
          tenant_id: "in.(t1,shared)",
          status: "eq.open",
          limit: "3",
          order: "priority.desc",
        },
        expected: { count: 0, tasks: [] },
      },
      {
        name: "search_tasks",
        args: { search_term: "needle", status: "open" },
        table: "tasks",
        filters: {
          tenant_id: "in.(t1,shared)",
          title: "ilike.%needle%",
          status: "eq.open",
          order: "created_at.desc",
        },
        expected: { count: 0, tasks: [] },
      },
      {
        name: "list_my_agent_tasks",
        args: { status: "pending", limit: 4 },
        table: "agent_tasks",
        filters: {
          tenant_id: "eq.t1",
          agent_id: "eq.agent-1",
          status: "eq.pending",
          limit: "4",
        },
        expected: { count: 0, tasks: [] },
      },
    ];

    for (const test of cases) {
      await t.step(test.name, async () => {
        const fixture = executorClient([[]], 200, {
          name: test.name,
          agentId: "agent-1",
        });

        const result = await executeWithContext(
          test.args,
          fixture.context,
          noRecursiveTool,
        );

        assertEquals(result, test.expected);
        assertEquals(fixture.calls.length, 1);
        const url = new URL(fixture.calls[0].url);
        assertEquals(url.pathname, `/rest/v1/${test.table}`);

        for (const [name, value] of Object.entries(test.filters)) {
          assertEquals(url.searchParams.get(name), value);
        }
      });
    }
  },
);
