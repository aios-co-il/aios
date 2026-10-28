import {
  jerusalemWeekdayIndex,
  jerusalemYmd,
  shiftYmd,
} from "../_shared/calendarTimeZone.ts";
import {
  jerusalemLocalTimeToUtc,
  jerusalemShabbatHoldUntil,
  NOTIFICATION_WINDOW_START,
} from "../_shared/shabbat/quiet-window.ts";

type ReminderDayTask = {
  due_date: string | null;
  recurrence_frequency?: string | null;
  recurrence_previous_task_id?: string | null;
};

/**
 * Moves a planned reminder onto the task's own day and out of Shabbat
 * (AIO-226). A recurring occurrence is created (and the worker invoked) as
 * soon as the previous one is done, so the day-before rule reminded it on the
 * day BEFORE its date: recurring occurrences wait until 08:30 Israel on their
 * own date. A reminder due on a Saturday moves to Friday 08:30; anything else
 * in the window waits until Sunday 08:30.
 */
export function onReminderDay(task: ReminderDayTask, planned: Date): Date {
  let at = planned;
  if (isRecurringTask(task) && task.due_date) {
    const ownDayStart = windowStartOn(task.due_date);
    if (at.getTime() < ownDayStart.getTime()) {
      at = ownDayStart;
    }
  }
  if (
    task.due_date &&
    jerusalemShabbatHoldUntil(at) &&
    jerusalemYmd(at) === task.due_date &&
    jerusalemWeekdayIndex(jerusalemLocalTimeToUtc(task.due_date, 12)) === 6
  ) {
    return windowStartOn(shiftYmd(task.due_date, -1));
  }
  return outsideShabbat(at);
}

/** A planned send inside the Shabbat window moves to Sunday 08:30. */
export function outsideShabbat(at: Date): Date {
  return jerusalemShabbatHoldUntil(at) ?? at;
}

/** A recurrence rule, or an occurrence generated from a previous one. */
function isRecurringTask(task: ReminderDayTask): boolean {
  return Boolean(task.recurrence_frequency || task.recurrence_previous_task_id);
}

/** 08:30 Israel time on the given calendar day. */
function windowStartOn(dateYmd: string): Date {
  return jerusalemLocalTimeToUtc(
    dateYmd,
    NOTIFICATION_WINDOW_START.hour,
    NOTIFICATION_WINDOW_START.minute,
  );
}
