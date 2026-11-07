/** The date window before each event date that analyze-campaign-data compares. */

/** One event's window: `daysBeforeEvent` days up to the event date. */
export type PeriodWindow = {
  /** The date as the user typed it ("D.M"), the period's key. */
  eventDate: string;
  startDate: string;
  endDate: string;
};

/**
 * The window of each "D.M" (or "DD.MM") event date; a month after the current
 * one is last year's. Dates that do not parse are skipped.
 */
export function eventPeriodWindows(
  eventDates: Array<string>,
  daysBeforeEvent: number,
  now: Date,
): Array<PeriodWindow> {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const windows: Array<PeriodWindow> = [];
  for (const dateStr of eventDates) {
    const parts = dateStr.trim().split(".");
    if (parts.length !== 2) {
      continue;
    }
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    if (isNaN(day) || isNaN(month)) {
      continue;
    }
    const year = month > currentMonth ? currentYear - 1 : currentYear;
    const eventDate = new Date(year, month - 1, day);
    const startDate = new Date(eventDate);
    startDate.setDate(startDate.getDate() - daysBeforeEvent);
    windows.push({
      eventDate: dateStr.trim(),
      startDate: startDate.toISOString().split("T")[0],
      endDate: eventDate.toISOString().split("T")[0],
    });
  }
  return windows;
}
