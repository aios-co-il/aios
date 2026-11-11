import { differenceInCalendarDays, startOfDay } from "date-fns";

/** Where a lead's follow-up date stands against today. */
export interface FollowUpDue {
  isOverdue: boolean;
  isToday: boolean;
  /** Calendar days past the follow-up date; 0 or less when not late. */
  daysLate: number;
}

/** Compares a follow-up date with today by calendar day, in local time. */
export function followUpDue(
  dateStr: string | null | undefined,
  now: Date = new Date(),
): FollowUpDue {
  if (!dateStr) {
    return { isOverdue: false, isToday: false, daysLate: 0 };
  }
  const diff = differenceInCalendarDays(
    startOfDay(now),
    startOfDay(new Date(dateStr)),
  );
  return { isOverdue: diff > 0, isToday: diff === 0, daysLate: diff };
}
