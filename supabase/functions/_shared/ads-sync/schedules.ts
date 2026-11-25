/**
 * Scheduled ads syncs, UTC: every 3 hours from 05:00 to 17:00 (07:00 to 19:00
 * in Israel winter time, 08:00 to 20:00 in summer). Each job keeps its own
 * minute so the three chains do not start together. Migration
 * 20261125110000_ads_sync_five_times_a_day sets these schedules; the job names
 * predate the cadence. The cron catalog (src/lib/cronJobsCatalog.ts) re-exports
 * this list.
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

/** Start times (minutes after midnight UTC) of every scheduled run of one daily cron. */
export function dailyRunMinutes(cron: string): Array<number> {
  const fields = parseCron(cron);
  if (!fields) {
    throw new Error(`ads sync schedule is not a cron expression: ${cron}`);
  }
  return fields.hours
    .flatMap((hour) => fields.minutes.map((minute) => hour * 60 + minute))
    .sort((a, b) => a - b);
}

/** Scheduled runs a day of the ads sync with the fewest runs. */
export const ADS_SYNC_RUNS_PER_DAY = Math.min(
  ...ADS_SYNC_SCHEDULES.map((job) => dailyRunMinutes(job.cron).length),
);
