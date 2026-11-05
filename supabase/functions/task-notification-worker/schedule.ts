import {
  jerusalemLocalTimeToUtc,
  NOTIFICATION_WINDOW_START,
} from "../_shared/shabbat/quiet-window.ts";
import { onReminderDay, outsideShabbat } from "./reminder-day.ts";

const ISRAEL_TIME_ZONE = "Asia/Jerusalem";
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

/** Israel wall-clock parts → UTC, through the shared DST-safe converter. */
function israelLocalToUtc(parts: LocalParts): Date {
  const dateYmd = `${parts.year}-${parts.month}-${parts.day}`;
  return jerusalemLocalTimeToUtc(dateYmd, parts.hour, parts.minute);
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
  const { hour, minute } = NOTIFICATION_WINDOW_START;
  return parts.hour < hour || (parts.hour === hour && parts.minute < minute);
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
    israelLocalToUtc({ ...dayAfterDue, ...NOTIFICATION_WINDOW_START }),
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

/** When the open-task reminder goes out (reminder-day.ts sets its day). */
export function taskReminderAt(task: ReminderTask): Date | null {
  const planned = plannedReminderAt(task);
  return planned ? onReminderDay(task, planned) : null;
}

/** Day-before slot for a dated task; 5h after creation at priority 8+. */
function plannedReminderAt(task: ReminderTask): Date | null {
  if (task.priority >= 8) {
    const fiveHoursLater = new Date(
      Date.parse(task.created_at) + 5 * 60 * 60 * 1000,
    );
    const local = localParts(fiveHoursLater);
    if (local.hour >= EVENING_CUTOFF_HOUR) {
      const nextMorning = shiftLocalDate(local, 1);
      return israelLocalToUtc({ ...nextMorning, ...NOTIFICATION_WINDOW_START });
    }
    if (isBeforeMorning(local)) {
      return israelLocalToUtc({ ...local, ...NOTIFICATION_WINDOW_START });
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
