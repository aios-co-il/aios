import { describe, expect, it } from "vitest";
import { toAgentGoal } from "./agentGoalRows";

const row = {
  id: "g1",
  tenant_id: "t1",
  agent_id: "a1",
  title: "Goal",
  description: null,
  priority: "high",
  status: "paused",
  target_date: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("toAgentGoal", () => {
  it("keeps known priority and status values", () => {
    expect(toAgentGoal(row)).toEqual(row);
  });

  it("falls back to the column defaults for unknown values", () => {
    const goal = toAgentGoal({ ...row, priority: "urgent", status: "x" });
    expect(goal.priority).toBe("medium");
    expect(goal.status).toBe("active");
  });
});
