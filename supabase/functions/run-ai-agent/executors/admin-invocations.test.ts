import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executorClient } from "./executor-client.test-fixture.ts";
import { executeCreateWhatsappInstance } from "./create-whatsapp-instance.ts";
import { executeDelegateToGithubAgent } from "./delegate-to-github-agent.ts";
import { executeDelegateToManus } from "./delegate-to-manus.ts";
import { executeSendMessageToManus } from "./send-message-to-manus.ts";

Deno.test(
  "creating a gateway line retains tenant and request fields",
  async () => {
    const fixture = executorClient([{ integrationId: "line" }]);
    assertEquals(
      await executeCreateWhatsappInstance(
        { displayName: "test", countryCode: "972" },
        fixture.context,
      ),
      { integrationId: "line" },
    );
    assertEquals(fixture.calls[0].body, {
      action: "create_instance",
      tenantId: "t1",
      displayName: "test",
      countryCode: "972",
    });
  },
);

Deno.test(
  "gateway creation preserves JSON HTTP error and status fallback",
  async () => {
    const fixture = executorClient([{}], 422);
    assertEquals(
      await executeCreateWhatsappInstance(
        { displayName: "test" },
        fixture.context,
      ),
      { error: "create_instance failed [422]" },
    );
  },
);

Deno.test(
  "GitHub delegation retains tenant, action and JSON success",
  async () => {
    const fixture = executorClient([{ result: "done" }]);
    assertEquals(
      await executeDelegateToGithubAgent(
        { message: "test", action: "analyze_error" },
        fixture.context,
      ),
      { result: "done" },
    );
    assertEquals(fixture.calls[0].body, {
      action: "analyze_error",
      tenant_id: "t1",
      message: "test",
    });
  },
);

Deno.test(
  "GitHub delegation retains plain-text success and raw HTTP errors",
  async () => {
    const success = executorClient([
      new Response("plain response", {
        headers: { "Content-Type": "text/plain" },
      }),
    ]);
    assertEquals(
      await executeDelegateToGithubAgent({ message: "test" }, success.context),
      { response: "plain response" },
    );

    const failed = executorClient([
      new Response("raw failure", { status: 502 }),
    ]);
    assertEquals(
      await executeDelegateToGithubAgent({ message: "test" }, failed.context),
      { error: "github-agent failed [502]: raw failure" },
    );
  },
);

Deno.test("Manus creation retains context and task response", async () => {
  const fixture = executorClient([
    { task_id: "task", task_url: "url", share_url: "share" },
  ]);
  const result = await executeDelegateToManus(
    { prompt: "test", context_data: "context" },
    fixture.context,
  );
  assertEquals(result.task_id, "task");
  assertEquals(result.task_url, "url");
  assertEquals(fixture.calls[0].body, {
    action: "create_task",
    tenantId: "t1",
    prompt: "test\n\nנתוני הקשר:\ncontext",
  });
});

Deno.test(
  "Manus creation keeps configuration and raw error distinctions",
  async () => {
    const missing = executorClient([{ error: "key not found" }], 400);
    await assertRejects(
      () => executeDelegateToManus({ prompt: "test" }, missing.context),
      Error,
      "Manus לא מוגדר",
    );

    const failed = executorClient([
      new Response("raw failure", { status: 503 }),
    ]);
    await assertRejects(
      () => executeDelegateToManus({ prompt: "test" }, failed.context),
      Error,
      "Manus API error [503]: raw failure",
    );
  },
);

Deno.test(
  "Manus follow-up preserves task routing and raw error text",
  async () => {
    const fixture = executorClient([{ task_id: "task" }]);
    const result = await executeSendMessageToManus(
      { task_id: "task", message: "test" },
      fixture.context,
    );
    assertEquals(result.task_id, "task");
    assertEquals(fixture.calls[0].body, {
      action: "send_message",
      tenantId: "t1",
      taskId: "task",
      message: "test",
    });

    const failed = executorClient([
      new Response("raw failure", { status: 502 }),
    ]);
    await assertRejects(
      () => executeSendMessageToManus({ message: "test" }, failed.context),
      Error,
      "Manus send_message error [502]: raw failure",
    );
  },
);

Deno.test(
  "relay failures retain status and raw body for Manus and GitHub",
  async () => {
    /** A fresh relay response body is required for each invocation. */
    function response() {
      return new Response("relay timed out", {
        status: 504,
        headers: { "x-relay-error": "true" },
      });
    }
    const manus = executorClient([response()]);
    await assertRejects(
      () => executeSendMessageToManus({ message: "test" }, manus.context),
      Error,
      "Manus send_message error [504]: relay timed out",
    );
    const github = executorClient([response()]);
    assertEquals(
      await executeDelegateToGithubAgent({ message: "test" }, github.context),
      { error: "github-agent failed [504]: relay timed out" },
    );
  },
);

Deno.test(
  "SDK transport failures without an HTTP response still reject",
  async () => {
    const fixture = executorClient([], 200, {}, () => {
      throw new Error("offline");
    });
    await assertRejects(() =>
      executeSendMessageToManus({ message: "test" }, fixture.context),
    );
  },
);

Deno.test(
  "Manus follow-up leaves target selection to the handler when no task is supplied",
  async () => {
    const fixture = executorClient([{ task_id: "agent-default-main_task" }]);
    await executeSendMessageToManus({ message: "test" }, fixture.context);
    assertEquals(fixture.calls[0].body, {
      action: "send_message",
      tenantId: "t1",
      message: "test",
    });
  },
);
