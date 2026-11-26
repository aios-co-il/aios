import { format } from "date-fns";
import type { DashboardDateRange } from "@/components/reports/ReportHeader/DashboardDateControls";

/** The days the shared dashboard shows: a preset, or a custom range. */
export type SharedDashboardWindow = {
  dateFilter: string;
  customDateRange: DashboardDateRange;
};

/** The custom range's days as yyyy-MM-dd, as DashboardView passes them on. */
export type CustomDays = { customFrom: string; customTo: string };

/** The picked custom days as yyyy-MM-dd; an end not picked yet is "". */
export function customDaysOf(dates: SharedDashboardWindow): CustomDays {
  const { from, to } = dates.customDateRange;
  return {
    customFrom: from ? format(from, "yyyy-MM-dd") : "",
    customTo: to ? format(to, "yyyy-MM-dd") : "",
  };
}

/** False while a custom range waits for both of its days. */
export function isWindowReady(dates: SharedDashboardWindow): boolean {
  const { customFrom, customTo } = customDaysOf(dates);
  return dates.dateFilter !== "custom" || (!!customFrom && !!customTo);
}

/**
 * The date part of a public-dashboard query: the preset, or for a custom
 * range its days, which the endpoint serves as `custom_start`/`custom_end`.
 */
export function windowQuery(
  dates: SharedDashboardWindow,
): Record<string, string> {
  const { customFrom, customTo } = customDaysOf(dates);
  if (dates.dateFilter === "custom" && customFrom && customTo) {
    return {
      date_filter: "custom",
      custom_start: customFrom,
      custom_end: customTo,
    };
  }
  return { date_filter: dates.dateFilter };
}
