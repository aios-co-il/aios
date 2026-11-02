/** Israel wall-clock text for chat findings and the model transcript. */
import { APP_TIME_ZONE } from "../../../_shared/calendarTimeZone.ts";

/** "09:05" in Israel time. */
export function israelClock(at: Date): string {
  return at.toLocaleTimeString("he-IL", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "ב-27.10 בשעה 09:05" in Israel time. */
export function israelDayAndClock(at: Date): string {
  const day = at.toLocaleDateString("he-IL", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "numeric",
  });
  return `ב-${day.replace("/", ".")} בשעה ${israelClock(at)}`;
}
