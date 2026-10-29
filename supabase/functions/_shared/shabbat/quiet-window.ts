/**
 * Shabbat quiet window (AIO-226). David's rule: Shabbat is the whole Saturday,
 * 00:00–23:59 Asia/Jerusalem (the calendar day, not candle-lighting/havdalah).
 */
import {
  APP_TIME_ZONE,
  jerusalemWeekdayIndex,
  jerusalemYmd,
  shiftYmd,
  timeZoneOffsetMs,
} from "../calendarTimeZone.ts";

/** 08:30 Israel: the daily notification window opens; Sunday's ends the hold. */
export const NOTIFICATION_WINDOW_START = { hour: 8, minute: 30 } as const;

/** True during Saturday, Israel time. */
export function isJerusalemShabbat(date: Date = new Date()): boolean {
  return jerusalemWeekdayIndex(date) === 6;
}

/**
 * When a held notification may go out again (Sunday 08:30 Israel), or null
 * when `now` is outside the window that starts Saturday 00:00.
 */
export function jerusalemShabbatHoldUntil(now: Date = new Date()): Date | null {
  const weekday = jerusalemWeekdayIndex(now);
  if (weekday !== 6 && weekday !== 0) {
    return null;
  }
  const today = jerusalemYmd(now);
  const sunday = weekday === 6 ? shiftYmd(today, 1) : today;
  const resumeAt = jerusalemLocalTimeToUtc(
    sunday,
    NOTIFICATION_WINDOW_START.hour,
    NOTIFICATION_WINDOW_START.minute,
  );
  return now.getTime() < resumeAt.getTime() ? resumeAt : null;
}

/** Wall-clock time on an Israel calendar day → UTC instant (DST-safe). */
export function jerusalemLocalTimeToUtc(
  dateYmd: string,
  hour: number,
  minute = 0,
): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, hour, minute);
  let result = target;
  // On a DST change day the offset at the answer differs from the offset at
  // `target`, so re-read it at each candidate until it settles.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = target - timeZoneOffsetMs(new Date(result), APP_TIME_ZONE);
  }
  return new Date(result);
}
