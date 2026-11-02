import { APP_TIME_ZONE, jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import {
  decidePulseRefresh,
  PULSE_REFRESH_MIN_INTERVAL_SECONDS,
} from "./snapshot.ts";

/** Every way a refresh request can end. */
export type PulseRefreshStatus =
  | "refreshed"
  | "fresh_snapshot"
  | "rate_limited"
  | "rate_limit_unavailable"
  | "not_configured"
  | "refresh_timeout"
  | "refresh_failed";

/** The one line Carmen puts before the pulse after a refresh request. */
export function buildPulseRefreshNote(
  status: PulseRefreshStatus,
  {
    freshness,
    now,
    minIntervalSeconds = PULSE_REFRESH_MIN_INTERVAL_SECONDS,
  }: {
    freshness: string | null | undefined;
    now: Date;
    minIntervalSeconds?: number;
  },
): string {
  const at = formatPulseTime(freshness, now);
  const stored = at
    ? `זו הבדיקה האחרונה שנשמרה (חושבה ב-${at}).`
    : "אין בדיקת דופק שמורה.";
  switch (status) {
    case "refreshed":
      return at
        ? `🔄 רעננתי את בדיקת הדופק עכשיו (${at}).`
        : "🔄 רעננתי את בדיקת הדופק עכשיו.";
    case "fresh_snapshot":
      return `⏱️ בדיקת הדופק כבר עדכנית, ולכן לא הרצתי אותה שוב. ${stored}`;
    case "rate_limited":
      // The claim is taken before the snapshot runs, so it does not prove a
      // newer snapshot exists: the other refresh may still run, or it failed.
      return decidePulseRefresh({
        lastCalculatedAt: freshness,
        now,
        minIntervalSeconds,
      }).refresh
        ? `⏱️ רענון של הדופק כבר הופעל בדקות האחרונות ועדיין לא נשמרה בדיקה חדשה; אפשר לנסות שוב בעוד כמה דקות. ${stored}`
        : `⏱️ הדופק רוענן בדקות האחרונות; אפשר לרענן שוב בעוד כמה דקות. ${stored}`;
    case "not_configured":
      return `⚠️ בדיקת הדופק לא מופעלת לארגון הזה, ולכן אין מה לרענן. ${stored}`;
    case "refresh_timeout":
      return `⚠️ הרענון לא הסתיים בזמן. ${stored}`;
    default:
      return `⚠️ לא הצלחתי לרענן את הדופק. ${stored}`;
  }
}

/** "13:05" today, "25.10 13:05" on an earlier day (Israel time). */
export function formatPulseTime(
  value: string | null | undefined,
  now: Date,
): string | null {
  const at = new Date(value ?? "");
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  const { date, time } = dayMonthTime(at);
  return jerusalemYmd(at) === jerusalemYmd(now) ? time : `${date} ${time}`;
}

/** The WhatsApp/task answer for a bare refresh request: note, then digest. */
export function buildPulseRefreshDigestReply(
  result: { refresh_note?: unknown; whatsapp_digest?: unknown } | null,
): string | null {
  const digest =
    typeof result?.whatsapp_digest === "string"
      ? result.whatsapp_digest.trim()
      : "";
  if (!digest) {
    return null;
  }
  const note =
    typeof result?.refresh_note === "string" ? result.refresh_note.trim() : "";
  return note ? `${note}\n\n${digest}` : digest;
}

/** "25.10" and "13:05" for a moment, in Israel time. */
function dayMonthTime(at: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("day")}.${get("month")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
