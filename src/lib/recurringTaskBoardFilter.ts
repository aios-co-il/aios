import { format, startOfDay } from "date-fns";
import { isTaskOverdue } from "./taskDeadline.ts";

type RecurringBoardTask = {
  recurrence_frequency?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  status?: string;
};

export function isRecurringBoardTask(task: RecurringBoardTask): boolean {
  return Boolean(task.recurrence_frequency);
}

/** Non-recurring tasks pass through; recurring ones only when due today or overdue. */
export function shouldShowRecurringTaskNow(
  task: RecurringBoardTask,
  asOf: Date = startOfDay(new Date()),
): boolean {
  if (!isRecurringBoardTask(task)) return true;
  if (!task.due_date) return false;
  const onDueDay =
    format(startOfDay(new Date(task.due_date)), "yyyy-MM-dd") ===
    format(asOf, "yyyy-MM-dd");
  // Completed recurring tasks stay on the calendar for their due day (marked done).
  if (task.status === "done") return onDueDay;
  if (isTaskOverdue(task, asOf)) return true;
  return onDueDay;
}

export function shouldShowRecurringTaskOnBoard(
  task: RecurringBoardTask,
  options: { showAllRecurring?: boolean; asOf?: Date } = {},
): boolean {
  if (!isRecurringBoardTask(task)) return true;
  if (options.showAllRecurring) {
    // Still show completed recurring tasks on their due day; hide other done rows.
    if (task.status === "done")
      return shouldShowRecurringTaskNow(task, options.asOf);
    return true;
  }
  return shouldShowRecurringTaskNow(task, options.asOf);
}

/** Recurring tasks in the week backlog only on their due day (untimed/overdue), not all week. */
export function recurringTaskBelongsInBacklog(
  task: RecurringBoardTask,
  today: Date = startOfDay(new Date()),
  showAllRecurring = false,
): boolean {
  if (!isRecurringBoardTask(task)) return false;
  if (task.status === "done") return false;
  if (!task.due_date) return showAllRecurring;
  if (showAllRecurring) {
    const dueDay = startOfDay(new Date(task.due_date));
    const onDueDayWithTime =
      format(dueDay, "yyyy-MM-dd") === format(today, "yyyy-MM-dd") &&
      Boolean(task.due_time);
    return !onDueDayWithTime;
  }
  if (isTaskOverdue(task, today)) return true;
  if (
    format(startOfDay(new Date(task.due_date)), "yyyy-MM-dd") !==
    format(today, "yyyy-MM-dd")
  ) {
    return false;
  }
  return !task.due_time;
}
