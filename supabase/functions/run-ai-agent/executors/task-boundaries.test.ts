import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeCreateTask } from "./create-task.ts";
import { executeUpdateTaskStatus } from "./update-task-status.ts";
import { executeListTasks } from "./list-tasks.ts";
import { executeApproveDevTask } from "./approve-dev-task.ts";
import { executeCreateGoal } from "./create-goal.ts";
import { executorClient } from "./test-client.ts";

const USER = "22222222-2222-4222-8222-222222222222";

Deno.test(
  "task creation preserves client agency, explicit assignment, and attribution",
  async () => {
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
  },
);

Deno.test("task status checks client access before writing", async () => {
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

Deno.test(
  "task list preserves general tasks when the campaigner has no client links",
  async () => {
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
  },
);

Deno.test(
  "developer task approval without a human turn performs no write",
  async () => {
    const fixture = executorClient(
      [
        {
          id: "dev",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          assigned_agent: "cursor",
          requested_by_user_id: USER,
          source_conversation_id: null,
        },
      ],
      200,
      {
        actorUserId: USER,
        devEscalationTier: "full",
      },
    );
    const result = await executeApproveDevTask(
      { dev_task_id: "dev" },
      fixture.context,
    );
    assert("error" in result);
    assertEquals(result.error, "dev_task_approval_not_app_chat");
    assertEquals(
      fixture.calls.map((call) => call.method),
      ["GET"],
    );
  },
);

Deno.test("goal creation preserves defaults and tenant binding", async () => {
  const fixture = executorClient([
    { id: "goal", title: "Grow", status: "active" },
  ]);
  assertEquals(await executeCreateGoal({ title: "Grow" }, fixture.context), {
    goal_id: "goal",
    title: "Grow",
    status: "active",
  });
  assertEquals(fixture.calls[0].body, {
    tenant_id: "t1",
    title: "Grow",
    description: null,
    parent_goal_id: null,
    due_date: null,
    owner_type: "agent",
    owner_id: null,
    status: "active",
    progress_percent: 0,
  });
});

Deno.test(
  "task completion keeps the completed-to-done storage mapping",
  async () => {
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
  },
);
