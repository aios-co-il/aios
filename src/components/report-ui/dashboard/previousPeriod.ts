import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

/** A calendar range of a dashboard filter, both ends inclusive (yyyy-MM-dd). */
export type CalendarRange = { startDate: string; endDate: string };

/**
 * The range of equal length that ends the day before `range` starts, so a
 * report can set each figure against the period before it.
 */
export function previousPeriodRange(range: CalendarRange): CalendarRange {
  const start = parseISO(range.startDate);
  const days = differenceInCalendarDays(parseISO(range.endDate), start) + 1;
  return {
    startDate: format(addDays(start, -days), "yyyy-MM-dd"),
    endDate: format(addDays(start, -1), "yyyy-MM-dd"),
  };
}

/**
 * The previous period of a filter's range; null when the filter has no bounds
 * ("all") or the range runs backwards.
 */
export function previousPeriodOf(range: {
  startDate: string | null;
  endDate: string | null;
}): CalendarRange | null {
  const { startDate, endDate } = range;
  if (!startDate || !endDate || startDate > endDate) {
    return null;
  }
  return previousPeriodRange({ startDate, endDate });
}
