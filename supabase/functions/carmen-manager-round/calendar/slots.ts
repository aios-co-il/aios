/**
 * Schedule slots (Asia/Jerusalem) of the round: collector crons, the morning
 * brief (BRIEF_CRON, _shared/manager-round/brief-schedule.ts) and the daily
 * list. A slot older than its stale window is skipped, never replayed.
 */
import { jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import { nextCronRun } from "../../_shared/cron-next.ts";
import type { BusinessCalendar } from "./business-hours.ts";

/** Batched non-urgent items for campaigners and managers: 08:30 Sunday–Thursday. */
export const LIST_CRON = "30 8 * * 0-4";

/** The managers' weekly roll-up (no_contact): with Sunday's 08:30 list. */
export const ROLLUP_CRON = "30 8 * * 0";

/** The round runs every 15 minutes; an hour covers a few missed calls. */
export const DEFAULT_STALE_MINUTES = 60;

/** The latest slot of `cron` in (now − staleMinutes, now], or null. */
export function latestSlot(
  cron: string,
  now: Date,
  staleMinutes = DEFAULT_STALE_MINUTES,
): Date | null {
  let slot = nextCronRun(cron, new Date(now.getTime() - staleMinutes * 60_000));
  if (!slot || slot > now) {
    return null;
  }
  for (
    let next = nextCronRun(cron, slot);
    next && next <= now;
    next = nextCronRun(cron, slot)
  ) {
    slot = next;
  }
  return slot;
}

/** The first slot of `cron` at or after `from` that is not a holiday. */
export function nextWorkingSlot(
  cron: string,
  from: Date,
  calendar: BusinessCalendar,
): Date | null {
  let slot = nextCronRun(cron, new Date(from.getTime() - 1));
  for (
    let i = 0;
    slot && i < 60 && calendar.holidays.includes(jerusalemYmd(slot));
    i++
  ) {
    slot = nextCronRun(cron, slot);
  }
  return slot;
}
