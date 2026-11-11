import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { executeCreateTask } from "./create-task.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

const USER = "22222222-2222-4222-8222-222222222222";

describe("executeCreateTask", () => {
  it("task creation preserves client agency, explicit assignment, and attribution", async () => {
    const fixture = executorClient(
      [
        { agency_id: "client-agency" },
        { id: "task", title: "Follow up", status: "open" },
      ],
      200,
      {
        userId: USER,
        callerCampaignerId: "caller-campaigner",
      },
    );
    const result = await executeCreateTask(
      {
        title: "Follow up",
        campaigner_id: "explicit-campaigner",
        client_id: "client",
      },
      fixture.context,
    );
    assertEquals(result, {
      task_id: "task",
      title: "Follow up",
      status: "open",
    });
    assertEquals(
      fixture.calls.map((call) => [call.method, new URL(call.url).pathname]),
      [
        ["GET", "/rest/v1/clients"],
        ["POST", "/rest/v1/tasks"],
      ],
    );
    assertEquals(fixture.calls[1].body, {
      title: "Follow up",
      agency_id: "client-agency",
      campaigner_id: "explicit-campaigner",
      tenant_id: "t1",
      priority: 5,
      status: "open",
      task_type: "other",
      client_id: "client",
      lead_id: null,
      duration_minutes: null,
      created_by: USER,
    });
  });
});
