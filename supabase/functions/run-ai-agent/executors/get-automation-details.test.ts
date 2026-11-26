import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeGetAutomationDetails } from "./get-automation-details.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test("automation lookup failure is not a missing automation", async () => {
  const fixture = executorClient([{ message: "database failed" }], 500);
  await assertRejects(() =>
    executeGetAutomationDetails({ name_search: "test" }, fixture.context),
  );
  assertEquals(fixture.calls.length, 1);
});

Deno.test(
  "failed step reads cannot report an automation with zero steps",
  async () => {
    const fixture = executorClient([
      { id: "auto", name: "test" },
      new Response(JSON.stringify({ message: "step lookup failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    ]);
    await assertRejects(() =>
      executeGetAutomationDetails({ automation_id: "auto" }, fixture.context),
    );
    assertEquals(fixture.calls.length, 2);
  },
);
