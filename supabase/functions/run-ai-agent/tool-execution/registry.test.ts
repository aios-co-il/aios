import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import contract from "./route-contract.json" with { type: "json" };
import { TOOL_ROUTES } from "./registry.ts";
import { executeWithContext } from "./dispatch.ts";
import { createChatReadContext } from "./chat-context.ts";
import { executorClient } from "../executors/test-client.ts";

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
      "record_income_payment",
      "delete_income_payment",
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
