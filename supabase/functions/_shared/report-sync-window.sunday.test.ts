import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  planScheduledSyncWindows,
  REPORT_MIN_SYNC_DAYS,
  shiftDateString,
} from "./report-sync-window.ts";

/** The refresh start of a scheduled run with full history. */
const refreshStart = (
  today: string,
  syncedThrough: string,
  lookbackOn: string,
) =>
  planScheduledSyncWindows(
    today,
    shiftDateString(today, -REPORT_MIN_SYNC_DAYS),
    syncedThrough,
    lookbackOn,
  ).refresh.startDate;

Deno.test("the first Sunday run re-fetches the last 7 days", () => {
  // 2026-11-08 is a Sunday; the last lookback ran the day before.
  assertStrictEquals(
    refreshStart("2026-11-08", "2026-11-07", "2026-11-07"),
    "2026-11-01",
  );
});

Deno.test("later Sunday runs and Monday keep the short window", () => {
  assertStrictEquals(
    refreshStart("2026-11-08", "2026-11-08", "2026-11-08"),
    "2026-11-08",
  );
  assertStrictEquals(
    refreshStart("2026-11-09", "2026-11-08", "2026-11-08"),
    "2026-11-08",
  );
});
