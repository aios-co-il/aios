/**
 * Scheduled ads syncs, UTC: every 3 hours from 05:00 to 17:00 (07:00 to 19:00
 * in Israel winter time, 08:00 to 20:00 in summer). Each job keeps its own
 * minute so the three chains do not start together. This file is the source
 * of truth for the ads sync cadence: migration
 * 20261125110000_ads_sync_five_times_a_day applies these schedules to pg_cron
 * and schedules.test.ts checks it matches. The job names predate the cadence.
 */
import { parseCron } from "../cron-next.ts";

export const ADS_SYNC_SCHEDULES = [
  {
    jobname: "sync-facebook-insights-twice-daily",
    cron: "0 5,8,11,14,17 * * *",
  },
  {
    jobname: "cron-sync-facebook-ecommerce-daily",
    cron: "5 5,8,11,14,17 * * *",
  },
  { jobname: "sync-google-ads-twice-daily", cron: "10 5,8,11,14,17 * * *" },
] as const;

/**
 * Start times (minutes after midnight UTC) of every scheduled run of one daily
 * cron, in order: parseCron returns hours and minutes sorted.
 */
export function dailyRunMinutes(cron: string): Array<number> {
  const fields = parseCron(cron);
  if (!fields) {
    throw new Error(`ads sync schedule is not a cron expression: ${cron}`);
  }
  return fields.hours.flatMap((hour) =>
    fields.minutes.map((minute) => hour * 60 + minute),
  );
}

/** Scheduled runs a day of the ads sync with the fewest runs. */
export const ADS_SYNC_RUNS_PER_DAY = Math.min(
  ...ADS_SYNC_SCHEDULES.map((job) => dailyRunMinutes(job.cron).length),
);
