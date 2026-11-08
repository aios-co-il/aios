import { describe, expect, it } from "vitest";
import { toTaskDetail } from "./taskDetail";

describe("toTaskDetail", () => {
  it("keeps known recurrence frequencies and other fields", () => {
    expect(toTaskDetail({ id: "t1", recurrence_frequency: "weekly" })).toEqual({
      id: "t1",
      recurrence_frequency: "weekly",
    });
  });

  it("maps missing or unknown frequencies to null", () => {
    expect(toTaskDetail({ id: "t1", recurrence_frequency: "yearly" })).toEqual({
      id: "t1",
      recurrence_frequency: null,
    });
    const task: { id: string; recurrence_frequency?: string | null } = {
      id: "t2",
    };
    expect(toTaskDetail(task)).toEqual({
      id: "t2",
      recurrence_frequency: null,
    });
  });
});
