import { APP_TIME_ZONE } from "../_shared/calendarTimeZone.ts";

/** Hour of day (0–23) in Asia/Jerusalem. Follows DST, unlike getUTCHours() + 3. */
export function jerusalemHour(
  date: Date = new Date(),
  timeZone = APP_TIME_ZONE,
): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .find((p) => p.type === "hour")?.value;
  return Number(hour ?? 0) % 24;
}
