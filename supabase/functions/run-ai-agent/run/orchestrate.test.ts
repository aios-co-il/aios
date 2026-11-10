import { assert, assertEquals } from "jsr:@std/assert@1";
import fixtures from "./parity-fixtures.json" with { type: "json" };
import { runFixture } from "./parity-fixture.ts";

// Captured from parent 9ab23bd884 with isolated skills caches and a fixed clock.
for (const fixture of fixtures) {
  Deno.test(
    `staged ${fixture.promptVersion} run preserves the parent prompt, response and call order`,
    async () => {
      const { result, calls } = await runFixture({
        promptVersion: fixture.promptVersion as "v1" | "v2",
      });
      assert(result instanceof Response);
      assertEquals(result.status, fixture.status);
      assertEquals(await result.json(), fixture.result);
      assertEquals(calls, fixture.calls);
    },
  );
}

Deno.test(
  "provider fallback retries the same round with unchanged conversation",
  async () => {
    const { result, calls } = await runFixture({
      settings: {
        google_api_key: "fake-google",
        openai_api_key: "fake-openai",
      },
      maxRounds: 1,
      modelResponses: [
        { status: 429, body: { error: { message: "quota exhausted" } } },
      ],
    });
    assert(result instanceof Response);
    assertEquals(result.status, 200);
    assertEquals((await result.json()).output, "Test response");
    const attempts = calls.filter((call) =>
      new URL(call.url).pathname.endsWith("/chat/completions"),
    );
    assertEquals(attempts.length, 2);
    const first = attempts[0].body as { model: string; messages: unknown };
    const second = attempts[1].body as { model: string; messages: unknown };
    assertEquals(first.model, "gemini-3-flash-preview");
    assertEquals(second.model, "gpt-5.4-mini");
    assertEquals(second.messages, first.messages);
  },
);

Deno.test(
  "tool results and provider call metadata survive into the next round in order",
  async () => {
    const events: Array<{ type?: string }> = [];
    const toolCall = {
      id: "call1",
      type: "function",
      function: { name: "recall_memory", arguments: "{}" },
      extra_content: { google: { thought_signature: "signature" } },
    };
    const { result, calls, executed } = await runFixture({
      body: { pin_skills_only: false, task_skills: [] },
      maxRounds: 2,
      emit: (event) => events.push(event as { type?: string }),
      modelResponses: [
        {
          body: {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [toolCall],
                },
              },
            ],
          },
        },
      ],
    });
    assert(result instanceof Response);
    assertEquals((await result.json()).tools_used, ["recall_memory"]);
    assertEquals(executed, [{ name: "recall_memory", args: {} }]);
    const attempts = calls.filter((call) =>
      new URL(call.url).pathname.endsWith("/chat/completions"),
    );
    const messages = (
      attempts[1].body as {
        messages: Array<{
          role: string;
          tool_calls?: unknown;
          content?: unknown;
        }>;
      }
    ).messages;
    assertEquals(messages.at(-2)?.tool_calls, [toolCall]);
    assertEquals(messages.at(-1)?.role, "tool");
    assertEquals(
      messages.at(-1)?.content,
      JSON.stringify({ count: 0, memories: [] }),
    );
    assertEquals(
      events.map((event) => event.type),
      ["tool_call", "tool_result", "token"],
    );
  },
);

Deno.test(
  "missing command logs failure before returning the unchanged error contract",
  async () => {
    const { result, calls } = await runFixture({ body: { command_text: "" } });
    assert(result instanceof Response);
    assertEquals(result.status, 400);
    assertEquals(await result.json(), {
      success: false,
      error: "Missing command_text",
    });
    assertEquals(calls.length, 1);
    assertEquals(
      [calls[0].method, new URL(calls[0].url).pathname],
      ["POST", "/rest/v1/error_logs"],
    );
  },
);

for (const scenario of [
  {
    name: "coding escalation",
    tool: "mcp_Cursor__request_dev_task",
    body: {},
    error: "dev_escalation_forbidden",
  },
  {
    name: "automation approval",
    tool: "execute_pending_approval",
    body: { automation_id: "automation" },
    error: "approval_not_allowed_in_automation",
  },
]) {
  Deno.test(
    `an injected ${scenario.name} tool call is refused before execution`,
    async () => {
      const { result, executed } = await runFixture({
        body: { pin_skills_only: false, task_skills: [], ...scenario.body },
        maxRounds: 2,
        modelResponses: [
          {
            body: {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "forbidden",
                        type: "function",
                        function: { name: scenario.tool, arguments: "{}" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      });
      assert(result instanceof Response);
      const payload = await result.json();
      assertEquals(payload.tool_log[0].result.error, scenario.error);
      assertEquals(executed, []);
    },
  );
}
