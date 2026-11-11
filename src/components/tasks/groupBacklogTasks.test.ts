import { describe, expect, test } from "vitest";
import { groupBacklogTasks } from "./groupBacklogTasks";
import type { Task } from "./taskTypes";

const today = new Date(2026, 10, 11, 15, 30);

function task(
  id: string,
  due_date: string | null,
  created_at: string,
  due_time: string | null = null,
): Task {
  return {
    id,
    title: id,
    notes: null,
    status: "open",
    priority: 5,
    due_date,
    due_time,
    client_id: null,
    lead_id: null,
    agency_id: null,
    campaigner_id: null,
    tenant_id: null,
    created_at,
  };
}

describe("groupBacklogTasks", () => {
  test("splits overdue, untimed and undated tasks, newest first", () => {
    const groups = groupBacklogTasks(
      [
        task("late", "2026-11-09", "2026-11-01"),
        task("undated-old", null, "2026-11-02"),
        task("undated-new", null, "2026-11-10"),
        task("today-no-time", "2026-11-11", "2026-11-05"),
      ],
      today,
    );

    expect(groups.overdue.map((t) => t.id)).toEqual(["late"]);
    expect(groups.untimed.map((t) => t.id)).toEqual(["today-no-time"]);
    expect(groups.unscheduled.map((t) => t.id)).toEqual([
      "undated-new",
      "undated-old",
    ]);
  });
});
