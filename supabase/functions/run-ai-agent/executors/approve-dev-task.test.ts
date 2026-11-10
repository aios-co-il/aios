import { assert, assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { executeApproveDevTask } from "./approve-dev-task.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

const USER = "22222222-2222-4222-8222-222222222222";

describe("executeApproveDevTask", () => {
  it("developer task approval without a human turn performs no write", async () => {
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
  });
});
