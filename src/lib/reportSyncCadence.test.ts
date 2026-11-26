import { describe, expect, test } from "vitest";
import {
  ADS_SYNC_SCHEDULES,
  dailyRunMinutes,
} from "../../supabase/functions/_shared/ads-sync/schedules.ts";
import { WOO_SYNC_SCHEDULE } from "./cronJobsCatalog.ts";

describe("report sync cadence", () => {
  test("WooCommerce starts 15 minutes before the first ads sync of the day", () => {
    const firstAdsRun = Math.min(
      ...ADS_SYNC_SCHEDULES.flatMap((job) => dailyRunMinutes(job.cron)),
    );
    const [morningWoo] = dailyRunMinutes(WOO_SYNC_SCHEDULE.cron);

    expect(firstAdsRun - morningWoo).toBe(15);
  });
});
