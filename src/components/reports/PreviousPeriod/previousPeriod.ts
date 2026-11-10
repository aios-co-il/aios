import {
  getJerusalemDashboardDateRange,
  shiftYmd,
} from "@/lib/calendarTimeZone";

/** A date window as yyyy-MM-dd strings, both ends included. */
export type PeriodRange = { startDate: string; endDate: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The window of the same length right before the report's window: the 7 days
 * before the last 7 days, the days of last month before this month so far.
 * Null when the report shows all history or a custom range is incomplete.
 * Days are counted in Israel time, as crm-records counts the report's own
 * window, so a browser abroad asks for the same days.
 */
export function previousPeriodRange(
  dateFilter: string,
  customFrom: string | null,
  customTo: string | null,
  now: Date = new Date(),
): PeriodRange | null {
  if (dateFilter === "custom" && !(customFrom && customTo)) {
    return null;
  }
  const { startDate, endDate } = getJerusalemDashboardDateRange(
    dateFilter,
    now,
    customFrom,
    customTo,
  );
  if (!startDate || !endDate) {
    return null;
  }
  const days = Math.round((utcDay(endDate) - utcDay(startDate)) / DAY_MS) + 1;
  return {
    startDate: shiftYmd(startDate, -days),
    endDate: shiftYmd(startDate, -1),
  };
}

/** How a metric moved from the previous period, for its arrow and colour. */
export type PeriodChange = "better" | "worse" | "same";

/**
 * Whether the change is good news: more leads is better, a higher cost per
 * lead is worse. Spend is neither, so it moves without a verdict ("same").
 */
export function periodChange(
  current: number,
  previous: number,
  direction: "higher" | "lower" | "neutral",
): PeriodChange {
  if (direction === "neutral" || current === previous) {
    return "same";
  }
  const rose = current > previous;
  return rose === (direction === "higher") ? "better" : "worse";
}

/** Midnight UTC of a yyyy-MM-dd day, so day arithmetic ignores clock changes. */
function utcDay(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}
