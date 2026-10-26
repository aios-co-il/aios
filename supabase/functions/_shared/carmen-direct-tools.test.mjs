import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { classifyDirectTool, directToolPool } from "./carmen-direct-tools.mjs";

Deno.test(
  "agent spawning, dev escalation and self-approval are blocked",
  () => {
    for (const n of [
      "delegate_to_subagent",
      "dispatch_dev_task",
      "mcp_Claude__ask_claude",
      "mcp_Cursor__request_dev_task",
      "execute_pending_approval",
      "",
    ]) {
      assertStrictEquals(classifyDirectTool(n), "blocked", n);
    }
  },
);

Deno.test(
  "external sends and deletions need approval; reads and tasks run directly",
  () => {
    assertStrictEquals(classifyDirectTool("send_message"), "approval");
    assertStrictEquals(classifyDirectTool("delete_task"), "approval");
    assertStrictEquals(classifyDirectTool("create_task"), "direct");
    assertStrictEquals(classifyDirectTool("list_clients"), "direct");
    // Already queued inside Carmen — no second gate.
    assertStrictEquals(classifyDirectTool("fb_pause"), "direct");
  },
);

Deno.test(
  "pool honours allow/deny lists and hides the system graph from non-managers",
  () => {
    const all = [
      "list_clients",
      "query_system_graph",
      "delegate_to_subagent",
      "delete_lead",
    ].map((name) => ({ name }));
    assertEquals(
      directToolPool(all).map((t) => t.name),
      ["list_clients", "delete_lead"],
    );
    assertEquals(
      directToolPool(all, {
        isManager: true,
        disabledTools: ["delete_lead"],
      }).map((t) => t.name),
      ["list_clients", "query_system_graph"],
    );
    assertEquals(
      directToolPool(all, { allowedTools: ["delete_lead"] }).map((t) => t.name),
      ["delete_lead"],
    );
  },
);
