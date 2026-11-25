import { assert, assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  ADS_SYNC_RUNS_PER_DAY,
  ADS_SYNC_SCHEDULES,
  dailyRunMinutes,
} from "./schedules.ts";

const MIGRATION = "20261125110000_ads_sync_five_times_a_day.sql";

describe("ADS_SYNC_SCHEDULES", () => {
  it("matches the cadence migration, which carries no secret", async () => {
    const sql = await Deno.readTextFile(
      new URL(`../../../migrations/${MIGRATION}`, import.meta.url),
    );

    for (const job of ADS_SYNC_SCHEDULES) {
      assert(
        sql.includes(`('${job.jobname}', '${job.cron}')`),
        `${job.jobname} at ${job.cron}`,
      );
    }
    assert(!sql.includes("Bearer "));
  });
});

describe("dailyRunMinutes", () => {
  it("lists every run of a daily cron in minutes after midnight UTC", () => {
    assertEquals(
      dailyRunMinutes("10 5,8,11,14,17 * * *"),
      [310, 490, 670, 850, 1030],
    );
    assertEquals(ADS_SYNC_RUNS_PER_DAY, 5);
  });
});
