import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { executeCreateGoal } from "./create-goal.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

describe("executeCreateGoal", () => {
  it("goal creation preserves defaults and tenant binding", async () => {
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
});
