import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  planScheduledSyncWindows,
  REPORT_MIN_SYNC_DAYS,
  SCHEDULED_CATCHUP_DAYS,
  SCHEDULED_LOOKBACK_DAYS,
  type ScheduledSyncPlan,
  shiftDateString,
  type SyncWindow,
} from "./report-sync-window.ts";

/** The markers a table stores after a successful run (scheduledMarkerPatch). */
type Markers = {
  historyFrom: string | null;
  syncedThrough: string | null;
  lookbackOn: string | null;
};

/** Plans `runs` successful scheduled runs on `today`, each starting from the markers the last one stored. */
function runDay(
  today: string,
  start: Markers,
  runs: number,
): Array<ScheduledSyncPlan> {
  const plans: Array<ScheduledSyncPlan> = [];
  let markers = start;
  for (let run = 0; run < runs; run++) {
    const plan = planScheduledSyncWindows(
      today,
      markers.historyFrom,
      markers.syncedThrough,
      markers.lookbackOn,
    );
    plans.push(plan);
    markers = {
      historyFrom: plan.historyFrom,
      syncedThrough: plan.syncedThrough,
      lookbackOn: plan.lookbackOn,
    };
  }
  return plans;
}

/** Days in a window, both ends included. */
function days(window: SyncWindow): number {
  const ms = Date.parse(window.endDate) - Date.parse(window.startDate);
  return ms / 86_400_000 + 1;
}

Deno.test(
  "five runs a day: only the first fetches yesterday and the lookback",
  () => {
    const today = "2026-11-25";
    const [first, ...later] = runDay(
      today,
      {
        historyFrom: shiftDateString(today, -REPORT_MIN_SYNC_DAYS),
        syncedThrough: shiftDateString(today, -1),
        lookbackOn: shiftDateString(today, -3),
      },
      5,
    );

    assertEquals(first.refresh, {
      startDate: shiftDateString(today, -SCHEDULED_LOOKBACK_DAYS),
      endDate: today,
    });
    for (const run of later) {
      assertEquals(run.refresh, { startDate: today, endDate: today });
      assertStrictEquals(run.catchup, null);
      assertStrictEquals(run.lookbackOn, today);
    }
  },
);

Deno.test(
  "five runs a day walk five catch-up slices back without overlap",
  () => {
    const today = "2026-11-25";
    const plans = runDay(
      today,
      { historyFrom: null, syncedThrough: today, lookbackOn: today },
      5,
    );
    const slices = plans.map((plan) => plan.catchup);

    assertStrictEquals(slices.filter(Boolean).length, 5);
    let previousStart = today;
    for (const slice of slices) {
      assert(slice);
      // Each slice ends the day before the last one began, so no day is
      // fetched (and cleared) twice, and none reaches into the refresh window.
      assertStrictEquals(slice.endDate, shiftDateString(previousStart, -1));
      assert(days(slice) <= SCHEDULED_CATCHUP_DAYS);
      assert(slice.startDate >= shiftDateString(today, -REPORT_MIN_SYNC_DAYS));
      previousStart = slice.startDate;
    }
    assertStrictEquals(
      plans.at(-1)?.historyFrom,
      shiftDateString(today, -5 * SCHEDULED_CATCHUP_DAYS),
    );
  },
);
