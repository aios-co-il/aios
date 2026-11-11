import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../../_shared/database.types.ts";
import { describe, it } from "jsr:@std/testing/bdd";
import { executeAssignTaskToCursor } from "./assign-task-to-cursor.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

describe("executeAssignTaskToCursor", () => {
  for (const scenario of [
    {
      name: "success",
      status: 200,
      body: '{"dispatched":1}',
      expected: { dispatched: 1 },
    },
    {
      name: "HTTP failure",
      status: 500,
      body: '{"error":"unavailable"}',
      expected: { error: "unavailable" },
    },
    {
      name: "missing content type",
      status: 200,
      body: '{"dispatched":2}',
      expected: { dispatched: 2 },
      contentType: "text/plain",
    },
    {
      name: "JSON string",
      status: 200,
      body: '"accepted"',
      expected: "accepted",
    },
    { name: "invalid JSON", status: 200, body: "invalid", expected: null },
    {
      name: "network failure",
      status: 200,
      body: "",
      expected: null,
      networkError: true,
    },
  ]) {
    it(`preserves dispatch result and write ordering on ${scenario.name}`, async () => {
      const task = {
        id: "task",
        title: "Task",
        status: "open" as const,
        assigned_agent: "Cursor",
      };
      const fixture = executorClient([task, null]);
      const calls = fixture.calls;
      fixture.context.supabase = createClient<Database>(
        "https://example.supabase.co",
        "test-key",
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: async (input, init) => {
              const request = new Request(input, init);
              const body = await request.json();
              calls.push({ url: request.url, method: request.method, body });
              if (request.url.includes("/functions/v1/")) {
                assertEquals(
                  calls.map((call) => call.method),
                  ["PATCH", "POST", "POST"],
                );
                assertEquals(
                  request.url,
                  "https://example.supabase.co/functions/v1/dispatch-cursor-tasks",
                );
                assertEquals(
                  request.headers.get("authorization"),
                  "Bearer test-key",
                );
                assertEquals(body, { tenant_id: "t1" });
                if (scenario.networkError) {
                  throw new Error("network offline");
                }
                return new Response(scenario.body, {
                  status: scenario.status,
                  headers: {
                    "Content-Type": scenario.contentType ?? "application/json",
                  },
                });
              }
              return new Response(
                JSON.stringify(calls.length === 1 ? task : null),
                {
                  headers: { "Content-Type": "application/json" },
                },
              );
            },
          },
        },
      );
      const result = await executeAssignTaskToCursor(
        { task_id: "task", notes: "note" },
        fixture.context,
      );
      assertEquals(result, {
        success: true,
        task,
        dispatch: scenario.expected,
      });
      assertEquals(calls.length, 3);
      assertEquals(calls[0].body, {
        assigned_agent: "Cursor",
        status: "open",
        notes: "note",
      });
      assertEquals(calls[1].body, {
        task_id: "task",
        user_id: null,
        tenant_id: "t1",
        content: "המשימה הוקצתה ל-Cursor — תור dispatch אוטומטי",
        update_type: "agent_action",
      });
    });
  }

  it("does not dispatch when the task write fails", async () => {
    const fixture = executorClient(
      [{ message: "write denied", code: "42501" }],
      403,
    );
    let caught: unknown;
    try {
      await executeAssignTaskToCursor({ task_id: "task" }, fixture.context);
    } catch (error) {
      caught = error;
    }
    assertEquals(caught, { message: "write denied", code: "42501" });
    assertEquals(
      fixture.calls.map((call) => call.method),
      ["PATCH"],
    );
  });
});
