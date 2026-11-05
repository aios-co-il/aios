/** The round's short date: day.month in Israel time (e.g. 27.10). */
import { APP_TIME_ZONE } from "../../_shared/calendarTimeZone.ts";

/** `at` as day.month on the Israel calendar. */
export function dayMonth(at: Date): string {
  return at.toLocaleDateString("he-IL", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "numeric",
  });
}
