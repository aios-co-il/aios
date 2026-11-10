import { getDashboardDateRange } from "@/lib/dashboardDateFilters";

/** A date window as yyyy-MM-dd strings, both ends included. */
export type PeriodRange = { startDate: string; endDate: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The window of the same length right before the report's window: the 7 days
 * before the last 7 days, the days of last month before this month so far.
 * Null when the report shows all history or a custom range is incomplete.
 */
export function previousPeriodRange(
  dateFilter: string,
  customFrom: string | null,
  customTo: string | null,
  now: Date = reportToday(),
): PeriodRange | null {
  if (dateFilter === "custom" && !(customFrom && customTo)) {
    return null;
  }
  const { startDate, endDate } = getDashboardDateRange(
    dateFilter,
    now,
    customFrom,
    customTo,
  );
  if (!startDate || !endDate) {
    return null;
  }
  const start = utcDay(startDate);
  const days = Math.round((utcDay(endDate) - start) / DAY_MS) + 1;
  return {
    startDate: isoDay(start - days * DAY_MS),
    endDate: isoDay(start - DAY_MS),
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

/**
 * Today's calendar date in the report's time zone (crm-records counts days in
 * Asia/Jerusalem), as a local Date, so a browser abroad asks for the same days.
 */
export function reportToday(instant: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const [year, month, day] = parts.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

/** Midnight UTC of a yyyy-MM-dd day, so day arithmetic ignores clock changes. */
function utcDay(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

/** A UTC timestamp as yyyy-MM-dd. */
function isoDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}
