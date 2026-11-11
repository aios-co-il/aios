import { describe, expect, test } from "vitest";
import { summarizeTasks } from "./taskSummary";

const today = new Date(2026, 10, 11);

function task(
  status: string,
  due_date: string | null,
  due_time: string | null = null,
) {
  return { status, due_date, due_time, target_date: null };
}

describe("summarizeTasks", () => {
  test("counts open tasks due today, overdue and waiting backlog, and done", () => {
    const overdue = task("open", "2026-11-09");
    const unscheduled = task("open", null);
    const untimedToday = task("open", "2026-11-11");
    const tasks = [
      overdue,
      unscheduled,
      untimedToday,
      task("open", "2026-11-11", "10:00:00"),
      task("done", "2026-11-11", "09:00:00"),
      task("done", "2026-11-12", "12:00:00"),
      task("open", "2026-11-13", "08:30:00"),
    ];

    expect(
      summarizeTasks({
        tasks,
        backlogTasks: [overdue, unscheduled, untimedToday],
        today,
      }),
    ).toEqual({ dueToday: 2, overdue: 1, awaitingSchedule: 2, done: 2 });
  });

  test("returns zeros for an empty board", () => {
    expect(summarizeTasks({ tasks: [], backlogTasks: [], today })).toEqual({
      dueToday: 0,
      overdue: 0,
      awaitingSchedule: 0,
      done: 0,
    });
  });
});
