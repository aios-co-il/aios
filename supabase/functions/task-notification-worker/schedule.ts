import {
  jerusalemLocalTimeToUtc,
  jerusalemWeekdayIndex,
  jerusalemYmd,
  shiftYmd,
} from "../_shared/calendarTimeZone.ts";
import { taskNotificationsHeldUntil } from "../_shared/task-notification-hold.ts";

export { taskNotificationsHeldUntil };

const ISRAEL_TIME_ZONE = "Asia/Jerusalem";
const MORNING_HOUR = 8;
const MORNING_MINUTE = 30;
const EVENING_CUTOFF_HOUR = 20;

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function localParts(date: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function israelLocalToUtc(parts: LocalParts): Date {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  let result = new Date(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = localParts(result);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    result = new Date(result.getTime() + target - actualAsUtc);
  }
  return result;
}

function shiftLocalDate(parts: LocalParts, days: number): LocalParts {
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
  };
}

function isBeforeMorning(parts: LocalParts) {
  return (
    parts.hour < MORNING_HOUR ||
    (parts.hour === MORNING_HOUR && parts.minute < MORNING_MINUTE)
  );
}

/** A planned send inside the Shabbat window moves to Sunday 08:30. */
function outsideShabbat(at: Date): Date {
  return taskNotificationsHeldUntil(at) ?? at;
}

export function taskOverdueNotifyAt(task: {
  due_date: string | null;
}): Date | null {
  if (!task.due_date) return null;
  const [year, month, day] = task.due_date.split("-").map(Number);
  const dayAfterDue = shiftLocalDate(
    { year, month, day, hour: 0, minute: 0 },
    1,
  );
  return outsideShabbat(
    israelLocalToUtc({
      ...dayAfterDue,
      hour: MORNING_HOUR,
      minute: MORNING_MINUTE,
    }),
  );
}

type ReminderTask = {
  priority: number;
  created_at: string;
  due_date: string | null;
  due_time: string | null;
  recurrence_frequency?: string | null;
  recurrence_previous_task_id?: string | null;
};

export function isRecurringTask(task: {
  recurrence_frequency?: string | null;
  recurrence_previous_task_id?: string | null;
}): boolean {
  return Boolean(task.recurrence_frequency || task.recurrence_previous_task_id);
}

/**
 * When the open-task reminder goes out.
 *
 * One-off tasks keep the day-before heads-up. A recurring occurrence is created
 * (and the worker invoked) as soon as the previous one is done, so the same
 * rule sent its reminder on the day BEFORE the task's day (AIO-226). Recurring
 * occurrences are never reminded before 08:30 Israel time on their own date.
 * Nothing goes out on Shabbat: a task due on Saturday is reminded on Friday
 * morning, anything else in the window waits until Sunday 08:30.
 */
export function taskReminderAt(task: ReminderTask): Date | null {
  let at = plannedReminderAt(task);
  if (!at) return null;
  if (isRecurringTask(task) && task.due_date) {
    const ownDayStart = jerusalemLocalTimeToUtc(
      task.due_date,
      MORNING_HOUR,
      MORNING_MINUTE,
    );
    if (at.getTime() < ownDayStart.getTime()) at = ownDayStart;
  }
  if (
    task.due_date &&
    taskNotificationsHeldUntil(at) &&
    jerusalemYmd(at) === task.due_date &&
    jerusalemWeekdayIndex(jerusalemLocalTimeToUtc(task.due_date, 12)) === 6
  ) {
    return jerusalemLocalTimeToUtc(
      shiftYmd(task.due_date, -1),
      MORNING_HOUR,
      MORNING_MINUTE,
    );
  }
  return outsideShabbat(at);
}

function plannedReminderAt(task: ReminderTask): Date | null {
  if (task.priority >= 8) {
    const fiveHoursLater = new Date(
      Date.parse(task.created_at) + 5 * 60 * 60 * 1000,
    );
    const local = localParts(fiveHoursLater);
    if (local.hour >= EVENING_CUTOFF_HOUR) {
      const nextMorning = shiftLocalDate(local, 1);
      return israelLocalToUtc({
        ...nextMorning,
        hour: MORNING_HOUR,
        minute: MORNING_MINUTE,
      });
    }
    if (isBeforeMorning(local)) {
      return israelLocalToUtc({
        ...local,
        hour: MORNING_HOUR,
        minute: MORNING_MINUTE,
      });
    }
    return fiveHoursLater;
  }

  if (!task.due_date) return null;
  const [year, month, day] = task.due_date.split("-").map(Number);
  const [hour = 9, minute = 0] = (task.due_time || "09:00")
    .split(":")
    .map(Number);
  const previousDay = shiftLocalDate({ year, month, day, hour, minute }, -1);
  if (previousDay.hour >= EVENING_CUTOFF_HOUR || isBeforeMorning(previousDay)) {
    return israelLocalToUtc({ ...previousDay, hour: 19, minute: 0 });
  }
  return israelLocalToUtc(previousDay);
}

export function taskNotificationScope(input: {
  taskCampaignerId: string | null;
  taskSalesPersonId: string | null;
  creatorCampaignerId: string | null;
  creatorSalesPersonId: string | null;
  creatorRoles: string[];
  hasCreator: boolean;
}) {
  const hasAssignee = Boolean(
    input.taskCampaignerId || input.taskSalesPersonId,
  );
  const isSelfAssigned = Boolean(
    (input.taskCampaignerId &&
      input.creatorCampaignerId === input.taskCampaignerId) ||
    (input.taskSalesPersonId &&
      input.creatorSalesPersonId === input.taskSalesPersonId),
  );
  const managementRoles = new Set([
    "team_manager",
    "owner",
    "agency_owner",
    "super_admin",
  ]);
  const creatorCanManage = input.creatorRoles.some((role) =>
    managementRoles.has(role),
  );

  return {
    isSelfAssigned,
    // Every cross-user assignment gets an immediate notification. Management
    // roles still control the later reminder/receipt workflow below.
    shouldNotifyAssignee: input.hasCreator && hasAssignee && !isSelfAssigned,
    isManagedAssignment: creatorCanManage && !isSelfAssigned,
  };
}
