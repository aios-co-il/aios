import { format } from "date-fns";
import { isTaskOverdue } from "@/lib/taskDeadline";
import type { Task } from "./taskTypes";

/** The headline counts of the Tasks screen, from the tasks already loaded. */
export interface TaskSummary {
  dueToday: number;
  overdue: number;
  awaitingSchedule: number;
  done: number;
}

type SummaryTask = Pick<
  Task,
  "status" | "due_date" | "due_time" | "target_date"
>;

/**
 * Counts what the board already holds: open tasks due today, overdue and
 * waiting-for-a-slot tasks from the backlog (so they match its panel), and
 * the done tasks inside the loaded range. No extra query: the board fetches
 * only the visible range, so "done" means done within that range.
 */
export function summarizeTasks({
  tasks,
  backlogTasks,
  today,
}: {
  tasks: Array<SummaryTask>;
  backlogTasks: Array<SummaryTask>;
  today: Date;
}): TaskSummary {
  const todayKey = format(today, "yyyy-MM-dd");
  const overdue = backlogTasks.filter((task) =>
    isTaskOverdue(task, today),
  ).length;
  return {
    dueToday: tasks.filter(
      (task) =>
        task.status !== "done" && task.due_date?.slice(0, 10) === todayKey,
    ).length,
    overdue,
    awaitingSchedule: backlogTasks.length - overdue,
    done: tasks.filter((task) => task.status === "done").length,
  };
}
