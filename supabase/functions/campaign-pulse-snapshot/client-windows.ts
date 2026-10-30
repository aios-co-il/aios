import { isRecord } from "../_shared/ads-sync/is-record.ts";
import { jerusalemYmd, shiftYmd } from "../_shared/calendarTimeZone.ts";

/**
 * Client-level windows in Asia/Jerusalem full days ending yesterday, matching
 * campaign_breakdown (pulseTrendWindows): today's partial day is never counted.
 */
export function pulseClientWindows(now: Date = new Date()) {
  const today = jerusalemYmd(now);
  const end = shiftYmd(today, -1);
  const current7Start = shiftYmd(end, -6);
  return {
    today,
    /** Last complete day (yesterday in Israel). */
    end,
    current3Start: shiftYmd(end, -2),
    current7Start,
    /** Prior 7 full days: previous7Start .. current7Start - 1. */
    previous7Start: shiftYmd(current7Start, -7),
    /** "Any data lately" check; may include today. */
    recent30Start: shiftYmd(today, -30),
    /** Oldest day any pulse window reads (campaign_breakdown baseline). */
    queryStart: shiftYmd(current7Start, -28),
  };
}

/** Rows dated on or before `endYmd` (drops today's partial day). */
export function recordsThrough<T extends { data?: unknown }>(
  rows: T[],
  endYmd: string,
): T[] {
  return rows.filter((row) => {
    const date = isRecord(row.data) ? row.data.date : undefined;
    return typeof date === "string" && date.slice(0, 10) <= endYmd;
  });
}
