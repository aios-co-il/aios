import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  runFixture,
  type CapturedRequest,
} from "./orchestrate.test-fixture.ts";

Deno.test(
  "final provider tools respect approval eligibility after all loading stages",
  async (t) => {
    for (const automation of [false, true]) {
      await t.step(automation ? "automation turn" : "person turn", async () => {
        const { result, calls } = await runFixture({
          body: {
            pin_skills_only: false,
            task_skills: [],
            ...(automation ? { automation_id: "automation-1" } : {}),
          },
        });
        assert(result instanceof Response);
        assertEquals(result.status, 200);

        const request = providerRequest(calls);
        assert(
          request.toolNames.includes("list_tasks"),
          "ordinary tools reach the provider",
        );
        for (const name of [
          "execute_pending_approval",
          "reject_pending_approval",
        ]) {
          assertEquals(request.toolNames.includes(name), !automation, name);
        }
      });
    }
  },
);

Deno.test(
  "executed V1/V2 branches append pulse rules after the tenant skin",
  async (t) => {
    for (const promptVersion of ["v1", "v2"] as const) {
      await t.step(promptVersion, async () => {
        const marker = "TENANT_SKIN_MARKER: use the tenant skin text first";
        const { result, calls } = await runFixture({
          promptVersion,
          skills: [{ slug: "review_marker", system_prompt: marker }],
          body: { pin_skills_only: false, task_skills: ["review_marker"] },
        });
        assert(result instanceof Response);
        assertEquals(result.status, 200);

        const request = providerRequest(calls);
        const systemMessages = request.messages.filter(
          (message) => message.role === "system",
        );
        assertEquals(systemMessages.length, 1);
        const prompt = systemMessages[0].content;
        assert(typeof prompt === "string");
        assert(
          prompt.includes(
            promptVersion === "v1"
              ? "ומנהלת Test tenant."
              : "ושל הארגון Test tenant",
          ),
        );
        assert(
          !prompt.includes(
            promptVersion === "v1"
              ? "ושל הארגון Test tenant"
              : "ומנהלת Test tenant.",
          ),
        );

        const pulse = "=== כללי דופק קמפיינים";
        assertEquals(prompt.split(pulse).length - 1, 1);
        assert(prompt.includes(marker), "the tenant skin was actually loaded");
        assert(prompt.lastIndexOf(marker) < prompt.indexOf(pulse));
        assert(request.toolNames.includes("refresh_campaign_pulse"));
      });
    }
  },
);

/** Inspect the actual request sent to the fake provider rather than reconstructed source. */
function providerRequest(calls: Array<CapturedRequest>) {
  const call = calls.find((entry) =>
    new URL(entry.url).pathname.endsWith("/chat/completions"),
  );
  assert(call);
  const body = call.body;
  assert(
    body && typeof body === "object" && "messages" in body && "tools" in body,
  );
  assert(Array.isArray(body.messages));
  assert(Array.isArray(body.tools));

  const messages = body.messages.map((message: unknown) => {
    assert(
      message &&
        typeof message === "object" &&
        "role" in message &&
        "content" in message,
    );
    return { role: message.role, content: message.content };
  });
  const toolNames = body.tools.map((tool: unknown) => {
    assert(tool && typeof tool === "object" && "function" in tool);
    const fn = tool.function;
    assert(
      fn &&
        typeof fn === "object" &&
        "name" in fn &&
        typeof fn.name === "string",
    );
    return fn.name;
  });
  return { messages, toolNames };
}
