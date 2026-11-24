import {
  getJerusalemDashboardDateRange,
  jerusalemDateRangeToIso,
} from "../_shared/calendarTimeZone.ts";
import type { DashboardWindow } from "../_shared/share-links/request-range.ts";

/** The WooCommerce order window, as Jerusalem day bounds in UTC ISO. */
export function wooWindowIso(range: DashboardWindow): {
  start: string | null;
  end: string | null;
} {
  const days = getJerusalemDashboardDateRange(
    range.dateFilter,
    new Date(),
    range.startDate,
    range.endDate,
  );
  return days.startDate && days.endDate
    ? jerusalemDateRangeToIso(days.startDate, days.endDate)
    : { start: null, end: null };
}
