import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { executeListTasks } from "./list-tasks.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

describe("executeListTasks", () => {
  it("task list preserves general tasks when the campaigner has no client links", async () => {
    const fixture = executorClient([[], []], 200, {
      callerCampaignerId: "campaigner",
    });
    assertEquals(await executeListTasks({}, fixture.context), {
      count: 0,
      tasks: [],
    });
    assertEquals(
      fixture.calls.map((call) => new URL(call.url).pathname),
      ["/rest/v1/client_team", "/rest/v1/tasks"],
    );
    const query = new URL(fixture.calls[1].url).searchParams;
    assertEquals(query.get("client_id"), "is.null");
    assertEquals(query.get("tenant_id"), "in.(t1,shared)");
  });
});
