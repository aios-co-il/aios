import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeProposeAutomationEdit } from "./propose-automation-edit.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "propose-automation-edit surfaces database failures instead of reporting missing data",
  async () => {
    const fixture = executorClient(
      [{ message: "database failed" }, { message: "fallback failed" }],
      500,
    );
    await assertRejects(() =>
      executeProposeAutomationEdit({ automation_id: "auto" }, fixture.context),
    );
    assertEquals(
      fixture.calls.some((call) => call.method !== "GET"),
      false,
    );
  },
);
