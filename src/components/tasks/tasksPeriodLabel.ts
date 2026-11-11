import { addDays, format, isSameMonth } from "date-fns";
import { he } from "date-fns/locale";
import type { ViewMode } from "./WeeklyTaskBoard";

/**
 * The period a calendar view shows, as its header reads it: the day, the
 * seven days from the start date, or the month. Empty for the chat view,
 * which has no period. `short` drops the year for the narrow mobile sheet.
 */
export function tasksPeriodLabel(
  viewMode: ViewMode,
  date: Date,
  { short = false }: { short?: boolean } = {},
): string {
  if (viewMode === "daily") {
    return format(date, short ? "EEEE, dd/MM" : "EEEE, d בMMMM yyyy", {
      locale: he,
    });
  }
  if (viewMode === "weekly") {
    return weekRangeLabel(date, short);
  }
  if (viewMode === "monthly") {
    return format(date, "MMMM yyyy", { locale: he });
  }
  return "";
}

/** "11–17 בנובמבר 2026", or "28 בנובמבר – 4 בדצמבר 2026" across months. */
function weekRangeLabel(start: Date, short: boolean): string {
  const end = addDays(start, 6);
  const year = short ? "" : " yyyy";
  if (isSameMonth(start, end)) {
    return `${format(start, "d")}–${format(end, `d בMMMM${year}`, { locale: he })}`;
  }
  return `${format(start, "d בMMMM", { locale: he })} – ${format(end, `d בMMMM${year}`, { locale: he })}`;
}
