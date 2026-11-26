import { assert, assertEquals } from "jsr:@std/assert@1";
import { runFixture } from "./orchestrate.test-fixture.ts";

const confirmation =
  "✅ משימה נשלחה ל-Manus AI\n🔗 https://manus.example/task/123\nמזהה: task-123";

for (const streaming of [false, true]) {
  Deno.test(
    `Manus returns JSON confirmation for a ${streaming ? "streaming" : "non-streaming"} caller`,
    async () => {
      const events: Array<unknown> = [];
      const { result, calls, executed } = await runFixture({
        body: {
          model_override: "manus-1",
          pin_skills_only: false,
          task_skills: [],
        },
        emit: streaming ? (event) => events.push(event) : undefined,
        modelResponses: [
          {
            body: {
              task_id: "task-123",
              task_url: "https://manus.example/task/123",
            },
          },
        ],
      });

      assert(result instanceof Response);
      assertEquals(result.status, 200);
      assertEquals(result.headers.get("Content-Type"), "application/json");
      assertEquals(result.headers.get("Access-Control-Allow-Origin"), "*");
      // The SSE boundary reads this same JSON for done.success and done.output.
      assertEquals(await result.json(), {
        success: true,
        output: confirmation,
      });
      assertEquals(
        events,
        streaming ? [{ type: "token", content: confirmation }] : [],
      );

      const tasks = calls.filter((call) =>
        new URL(call.url).pathname.endsWith("/manus-api"),
      );
      assertEquals(tasks.length, 1);
      assertEquals(tasks[0].method, "POST");
      assertEquals(tasks[0].body, {
        action: "create_task",
        tenantId: "t1",
        prompt: "hello",
      });
      assertEquals(executed, []);
      assertEquals(
        calls.some((call) => call.url.includes("/chat/completions")),
        false,
      );
    },
  );
}

for (const failure of [
  {
    status: 503,
    detail: "service unavailable",
    message: "Manus API error [503]: service unavailable",
  },
  {
    status: 400,
    detail: "api_key not configured",
    message: "Manus API key חסר — הגדר אותו בהגדרות אינטגרציות",
  },
]) {
  Deno.test(
    `Manus ${failure.status} failure keeps the error response and emits no success token`,
    async () => {
      const events: Array<unknown> = [];
      const { result } = await runFixture({
        body: {
          model_override: "manus-1",
          pin_skills_only: false,
          task_skills: [],
        },
        emit: (event) => events.push(event),
        modelResponses: [
          { status: failure.status, body: { error: failure.detail } },
        ],
      });

      assertEquals(result.status, 400);
      assertEquals(await result.json(), {
        success: false,
        error: failure.message,
      });
      assertEquals(events, []);
    },
  );
}
