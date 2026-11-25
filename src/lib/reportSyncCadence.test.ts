import { describe, expect, test } from "vitest";
import { ADS_SYNC_SCHEDULES, WOO_SYNC_SCHEDULE } from "./cronJobsCatalog.ts";

/** Minutes after midnight UTC of every run a plain "m h * * *" cron makes. */
function minutesOfDay(cron: string): Array<number> {
  const [minute, hour] = cron.split(/\s+/);
  const minutes = minute.split(",").map(Number);
  const hours = hour.split(",").map(Number);
  return hours
    .flatMap((h) => minutes.map((m) => h * 60 + m))
    .sort((a, b) => a - b);
}

describe("report sync cadence", () => {
  test("ads syncs run every 3 hours from 05:00 to 17:00 UTC", () => {
    for (const job of ADS_SYNC_SCHEDULES) {
      const hours = minutesOfDay(job.cron).map((m) => Math.floor(m / 60));

      expect(hours, job.jobname).toStrictEqual([5, 8, 11, 14, 17]);
    }
  });

  test("the three ads syncs start at different minutes", () => {
    const minutes = ADS_SYNC_SCHEDULES.map((job) => job.cron.split(" ")[0]);

    expect(minutes).toStrictEqual(["0", "5", "10"]);
  });

  test("WooCommerce starts 15 minutes before the first ads sync of the day", () => {
    const firstAdsRun = Math.min(
      ...ADS_SYNC_SCHEDULES.flatMap((job) => minutesOfDay(job.cron)),
    );
    const [morningWoo] = minutesOfDay(WOO_SYNC_SCHEDULE.cron);

    expect(firstAdsRun - morningWoo).toBe(15);
  });
});
