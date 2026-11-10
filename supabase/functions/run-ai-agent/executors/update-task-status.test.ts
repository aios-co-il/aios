import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { executeUpdateTaskStatus } from "./update-task-status.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

describe("executeUpdateTaskStatus", () => {
  it("task status checks client access before writing", async () => {
    const fixture = executorClient(
      [{ client_id: "client" }, { agency_id: "outside" }],
      200,
      {
        callerScope: {
          isManagerRole: false,
          isTeamManager: true,
          managedAgencyIds: ["allowed"],
          accessibleTenantIds: ["t1", "shared"],
        },
      },
    );
    await assertRejects(
      () =>
        executeUpdateTaskStatus(
          { task_id: "task", status: "completed" },
          fixture.context,
        ),
      Error,
    );
    assertEquals(
      fixture.calls.map((call) => call.method),
      ["GET", "GET"],
    );
  });

  it("task completion keeps the completed-to-done storage mapping", async () => {
    const fixture = executorClient(
      [{ id: "task", title: "Done", status: "done" }],
      200,
      {
        callerScope: {
          isManagerRole: true,
          isTeamManager: false,
          managedAgencyIds: [],
          accessibleTenantIds: ["t1", "shared"],
        },
      },
    );
    assertEquals(
      await executeUpdateTaskStatus(
        { task_id: "task", status: "completed" },
        fixture.context,
      ),
      { id: "task", title: "Done", status: "done" },
    );
    assertEquals(
      fixture.calls.map((call) => call.method),
      ["PATCH"],
    );
    assertEquals(fixture.calls[0].body, { status: "done" });
  });
});
