/**
 * Business-hours arithmetic in Asia/Jerusalem for the round's quiet hours and
 * escalation ladder. Windows come from the tenant's manager settings
 * (default Sun–Thu 09–19, Fri 09–13); Saturday and holidays have none.
 */
import { jerusalemYmd, shiftYmd } from "../../_shared/calendarTimeZone.ts";
import { jerusalemLocalTimeToUtc } from "../../_shared/shabbat/quiet-window.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";

export type BusinessCalendar = Pick<
  ManagerSettings,
  "business_hours" | "holidays"
>;

/** How far ahead to look for business time (covers long holiday runs). */
const MAX_DAYS = 60;

/** True when `at` falls inside a business window. */
export function isBusinessTime(at: Date, calendar: BusinessCalendar): boolean {
  const window = businessWindow(jerusalemYmd(at), calendar);
  return !!window && at >= window.start && at < window.end;
}

/** `at` itself during business hours, else the start of the next window. */
export function nextBusinessStart(at: Date, calendar: BusinessCalendar): Date {
  return addBusinessHours(at, 0, calendar, true);
}

/**
 * The instant `hours` business hours after `start`. With `snap`, a zero
 * duration still moves `start` into business time.
 */
export function addBusinessHours(
  start: Date,
  hours: number,
  calendar: BusinessCalendar,
  snap = false,
): Date {
  let remaining = Math.max(0, hours) * 3_600_000;
  if (remaining === 0 && !snap) {
    return start;
  }
  let cursor = start;
  for (let i = 0; i < MAX_DAYS; i++) {
    const day = jerusalemYmd(cursor);
    const window = businessWindow(day, calendar);
    if (window && cursor < window.end) {
      const from = cursor > window.start ? cursor : window.start;
      const available = window.end.getTime() - from.getTime();
      if (available >= remaining) {
        return new Date(from.getTime() + remaining);
      }
      remaining -= available;
    }
    // Exact local midnight: jerusalemDayStartIso uses the noon offset, which
    // is an hour off on the night the clocks change.
    cursor = jerusalemLocalTimeToUtc(shiftYmd(day, 1), 0, 0);
  }
  return cursor;
}

/** Business hours elapsed in [start, end), e.g. how long a client has waited. */
export function businessHoursBetween(
  start: Date,
  end: Date,
  calendar: BusinessCalendar,
): number {
  let total = 0;
  let day = jerusalemYmd(start);
  const last = jerusalemYmd(end);
  for (let i = 0; i < MAX_DAYS && day <= last; i++) {
    const window = businessWindow(day, calendar);
    if (window) {
      const from = Math.max(window.start.getTime(), start.getTime());
      const to = Math.min(window.end.getTime(), end.getTime());
      total += Math.max(0, to - from);
    }
    day = shiftYmd(day, 1);
  }
  return total / 3_600_000;
}

/**
 * The opening of the business day `days` business days after the day of
 * `start` (Saturday, holidays and days without hours are not counted).
 */
export function businessDaysLater(
  start: Date,
  days: number,
  calendar: BusinessCalendar,
): Date {
  let day = jerusalemYmd(start);
  let left = Math.max(1, Math.round(days));
  for (let i = 0; i < MAX_DAYS; i++) {
    day = shiftYmd(day, 1);
    const window = businessWindow(day, calendar);
    if (!window) {
      continue;
    }
    left -= 1;
    if (left === 0) {
      return window.start;
    }
  }
  return jerusalemLocalTimeToUtc(day, 0, 0);
}

/** The business window [start, end) of an Israel calendar day, or null. */
export function businessWindow(
  day: string,
  calendar: BusinessCalendar,
): { start: Date; end: Date } | null {
  if (calendar.holidays.includes(day)) {
    return null;
  }
  const hours = calendar.business_hours[weekdayOf(day)];
  if (!hours) {
    return null;
  }
  return { start: atHour(day, hours[0]), end: atHour(day, hours[1]) };
}

/** Weekday (0 = Sunday) of a calendar date, independent of time zone. */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** A fractional local hour on an Israel calendar day, as a UTC instant. */
function atHour(day: string, hour: number): Date {
  const whole = Math.floor(hour);
  return jerusalemLocalTimeToUtc(day, whole, Math.round((hour - whole) * 60));
}
