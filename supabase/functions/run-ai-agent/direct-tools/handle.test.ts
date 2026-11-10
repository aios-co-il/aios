import { assertEquals } from "jsr:@std/assert@1";
import { handleDirectTool } from "./handle.ts";
import { executorClient } from "../executors/test-client.ts";
import type { DirectToolDependencies } from "./types.ts";

const USER = "22222222-2222-4222-8222-222222222222";

/** Exercises the actual direct-tool query/order and replaces only external tool side effects. */
function fixture(
  responses: Parameters<typeof executorClient>[0],
  result: unknown = { success: true },
) {
  const database = executorClient(responses);
  const executions: Array<Parameters<DirectToolDependencies["executeTool"]>> =
    [];
  const dependencies: DirectToolDependencies = {
    createClient: () => database.context.supabase,
    executeTool: async (...args) => {
      executions.push(args);
      return result;
    },
  };
  return { ...database, executions, dependencies };
}

Deno.test(
  "sensitive direct-tool calls enqueue approval after caller resolution without executing",
  async () => {
    const test = fixture((request) => {
      const table = new URL(request.url).pathname.split("/").at(-1);
      if (table === "ai_agents") {
        return {
          id: "agent",
          allowed_tools: ["send_message"],
          disabled_tools: [],
        };
      }
      if (table === "user_roles") {
        return [{ role: "owner" }];
      }
      if (table === "profiles") {
        return { campaigner_id: null };
      }
      if (table === "agent_approval_queue") {
        return { id: "approval" };
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const response = await handleDirectTool(
      {
        tenant_id: "t1",
        user_id: USER,
        direct_tool: {
          action: "call",
          name: "send_message",
          args: {
            contact_type: "client",
            contact_id: "client",
            message_text: "Hello",
          },
        },
      },
      test.dependencies,
    );
    assertEquals((await response.json()).result.approval_id, "approval");
    assertEquals(test.executions, []);
    assertEquals(
      [test.calls[0].method, new URL(test.calls[0].url).pathname],
      ["GET", "/rest/v1/ai_agents"],
    );
    assertEquals(
      test.calls
        .slice(1, 3)
        .map((call) => new URL(call.url).pathname)
        .sort(),
      ["/rest/v1/profiles", "/rest/v1/user_roles"],
    );
    assertEquals(
      [test.calls[3].method, new URL(test.calls[3].url).pathname],
      ["POST", "/rest/v1/agent_approval_queue"],
    );
    const body = test.calls[3].body as {
      tool_name: string;
      tool_input: unknown;
      requested_by: string;
      status: string;
    };
    assertEquals(
      [body.tool_name, body.tool_input, body.requested_by, body.status],
      [
        "send_message",
        { contact_type: "client", contact_id: "client", message_text: "Hello" },
        USER,
        "pending",
      ],
    );
  },
);

Deno.test(
  "service-approved execution retains its out-of-band marker before updating terminal status",
  async () => {
    const row = {
      id: "approval",
      tenant_id: "t1",
      requested_by: null,
      agent_id: "agent",
      action_type: "agent_direct_tool",
      status: "pending",
      tool_name: "read",
      tool_input: { id: "client" },
      approved_at: null,
    };
    const test = fixture([row, null]);
    const response = await handleDirectTool(
      { direct_tool: { action: "execute_approved", approval_id: "approval" } },
      test.dependencies,
    );
    assertEquals(response.status, 200);
    assertEquals(test.executions.length, 1);
    assertEquals(test.executions[0][13], { outOfBand: true });
    assertEquals(test.executions[0].slice(0, 2), ["read", { id: "client" }]);
    assertEquals(
      test.calls.map((call) => call.method),
      ["GET", "PATCH"],
    );
    assertEquals((test.calls[1].body as { status: string }).status, "executed");
  },
);

Deno.test(
  "executed/rejected approvals stop before any scope lookup, tool call or status write",
  async () => {
    for (const status of ["executed", "rejected"]) {
      const test = fixture([
        { id: "approval", action_type: "agent_direct_tool", status },
      ]);
      const response = await handleDirectTool(
        {
          direct_tool: { action: "execute_approved", approval_id: "approval" },
        },
        test.dependencies,
      );
      assertEquals(response.status, 409);
      assertEquals(await response.json(), { error: `approval_${status}` });
      assertEquals(test.executions, []);
      assertEquals(test.calls.length, 1);
    }
  },
);

Deno.test(
  "a still-pending tool result marks direct approval execution failed",
  async () => {
    const test = fixture(
      [
        {
          id: "approval",
          tenant_id: "t1",
          requested_by: null,
          action_type: "agent_direct_tool",
          status: "pending",
          tool_name: "read",
          tool_input: {},
        },
        null,
      ],
      { pending_approval: true },
    );
    const response = await handleDirectTool(
      { direct_tool: { action: "execute_approved", approval_id: "approval" } },
      test.dependencies,
    );
    assertEquals(response.status, 400);
    assertEquals((test.calls[1].body as { status: string }).status, "failed");
  },
);
