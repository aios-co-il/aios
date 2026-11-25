import { assert } from "jsr:@std/assert@1";
import { ADS_SYNC_SCHEDULES } from "../../../src/lib/cronJobsCatalog.ts";

const MIGRATION = "20261125100000_ads_sync_five_times_a_day.sql";

Deno.test(
  "the ads sync cadence migration matches the catalog and carries no secret",
  async () => {
    const sql = await Deno.readTextFile(
      new URL(`../../migrations/${MIGRATION}`, import.meta.url),
    );

    for (const job of ADS_SYNC_SCHEDULES) {
      assert(
        sql.includes(`('${job.jobname}', '${job.cron}')`),
        `${job.jobname} at ${job.cron}`,
      );
    }
    assert(!sql.includes("Bearer "));
  },
);
