import { isTaskOverdue } from "@/lib/taskDeadline";
import type { Task } from "./taskTypes";

/** The backlog's three groups, each newest first. */
export interface BacklogGroups {
  /** Deadline in the past. */
  overdue: Array<Task>;
  /** A date today or later but no time yet. */
  untimed: Array<Task>;
  /** No date at all. */
  unscheduled: Array<Task>;
}

/** Splits backlog tasks into overdue, waiting-for-a-time and undated. */
export function groupBacklogTasks(
  tasks: Array<Task>,
  today: Date,
): BacklogGroups {
  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);
  return {
    overdue: tasks
      .filter((t) => isTaskOverdue(t, dayStart))
      .sort(sortNewestFirst),
    untimed: tasks
      .filter((t) => {
        if (!t.due_date || isTaskOverdue(t, dayStart)) {
          return false;
        }
        return new Date(t.due_date) >= dayStart && !t.due_time;
      })
      .sort(sortNewestFirst),
    unscheduled: tasks.filter((t) => !t.due_date).sort(sortNewestFirst),
  };
}

/** Newest first, with the id as a stable tie-break. */
function sortNewestFirst(a: Task, b: Task) {
  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (bTime !== aTime) {
    return bTime - aTime;
  }
  return b.id.localeCompare(a.id);
}
