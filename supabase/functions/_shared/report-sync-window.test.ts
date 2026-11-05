import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  REPORT_MIN_SYNC_DAYS,
  SCHEDULED_CATCHUP_DAYS,
  SCHEDULED_LOOKBACK_DAYS,
  SCHEDULED_LOOKBACK_EVERY_DAYS,
  jerusalemToday,
  planScheduledSyncWindows,
  replacedRecordsFilter,
  resolveAdsSyncWindow,
  resolvePruneStart,
  shiftDateString,
  toDateString,
} from "./report-sync-window.ts";

Deno.test(
  "a 30-day table still syncs every rolling dashboard preset through 120 days",
  () => {
    const today = "2026-09-18";
    const window = resolveAdsSyncWindow(
      { startDate: shiftDateString(today, -30), endDate: today },
      today,
    );

    assertStrictEquals(
      window.startDate,
      shiftDateString(today, -REPORT_MIN_SYNC_DAYS),
    );
    assertStrictEquals(window.endDate, today);
    assertStrictEquals(REPORT_MIN_SYNC_DAYS, 120);
    assert(window.startDate <= shiftDateString(today, -120));
  },
);

Deno.test("a configured range deeper than the minimum is kept", () => {
  const today = "2026-09-18";
  const window = resolveAdsSyncWindow(
    { startDate: "2025-09-18", endDate: today },
    today,
  );

  assertStrictEquals(window.startDate, "2025-09-18");
  assertStrictEquals(window.endDate, today);
});

Deno.test("a window ending in the past is extended to today", () => {
  const today = "2026-09-18";
  const window = resolveAdsSyncWindow(
    { startDate: "2026-09-06", endDate: "2026-09-12" },
    today,
  );

  assertStrictEquals(window.endDate, today);
});

Deno.test(
  "prune start follows provider rows dated before the requested window",
  () => {
    const window = { startDate: "2026-06-20", endDate: "2026-09-18" };

    assertStrictEquals(
      resolvePruneStart(window, ["2026-07-01", "2026-09-17"]),
      "2026-06-20",
    );
    assertStrictEquals(
      resolvePruneStart(window, ["2026-06-19", "2026-09-17"]),
      "2026-06-19",
    );
    assertStrictEquals(
      resolvePruneStart(window, ["", null, undefined, "not-a-date"]),
      "2026-06-20",
    );
    assertStrictEquals(
      resolvePruneStart(window, ["2026-06-18T00:00:00Z"]),
      "2026-06-18",
    );
  },
);

Deno.test(
  "prune filter clears the rewritten window and undated rows but keeps older history",
  () => {
    const filter = replacedRecordsFilter("2026-06-20");

    assertEquals(filter.split(","), [
      "data->>date.gte.2026-06-20",
      "data->>date.is.null",
      "data->>date.lt.1900-01-01",
    ]);
  },
);

const FULL_HISTORY = (today: string) =>
  shiftDateString(today, -REPORT_MIN_SYNC_DAYS);
const plan = (
  today: string,
  syncedThrough: string | null | undefined,
  lookbackOn: string | null | undefined = today,
) =>
  planScheduledSyncWindows(
    today,
    FULL_HISTORY(today),
    syncedThrough,
    lookbackOn,
  );

Deno.test(
  "the morning run fetches yesterday and today after yesterday's afternoon run",
  () => {
    const morning = plan("2026-10-06", "2026-10-05", "2026-10-05");

    assertEquals(morning.refresh, {
      startDate: "2026-10-05",
      endDate: "2026-10-06",
    });
    assertStrictEquals(morning.catchup, null);
    assertStrictEquals(morning.syncedThrough, "2026-10-06");
    assertStrictEquals(morning.lookbackOn, "2026-10-05");
  },
);

Deno.test(
  "the afternoon run fetches only today after this morning's run",
  () => {
    const afternoon = plan("2026-10-06", "2026-10-06");

    assertEquals(afternoon.refresh, {
      startDate: "2026-10-06",
      endDate: "2026-10-06",
    });
    assertStrictEquals(afternoon.catchup, null);
  },
);

Deno.test("missed runs are filled from the last successful day", () => {
  assertEquals(plan("2026-10-06", "2026-10-02").refresh, {
    startDate: "2026-10-02",
    endDate: "2026-10-06",
  });
});

Deno.test("a gap never reaches past the 120-day floor", () => {
  assertStrictEquals(
    plan("2026-10-06", "2025-01-01").refresh.startDate,
    FULL_HISTORY("2026-10-06"),
  );
});

Deno.test("without a run marker the run covers yesterday and today", () => {
  for (const marker of [null, undefined, "not-a-date"]) {
    assertEquals(plan("2026-10-06", marker).refresh, {
      startDate: "2026-10-05",
      endDate: "2026-10-06",
    });
  }
});

Deno.test("a marker after today is clamped to today", () => {
  assertEquals(plan("2026-10-06", "2026-10-07").refresh, {
    startDate: "2026-10-06",
    endDate: "2026-10-06",
  });
});

Deno.test(
  "every third day the morning run re-fetches the last 7 days for late conversions",
  () => {
    const today = "2026-10-06";
    const due = plan(
      today,
      "2026-10-05",
      shiftDateString(today, -SCHEDULED_LOOKBACK_EVERY_DAYS),
    );

    assertEquals(due.refresh, {
      startDate: shiftDateString(today, -SCHEDULED_LOOKBACK_DAYS),
      endDate: today,
    });
    assertStrictEquals(due.lookbackOn, today);

    const afternoon = plan(today, today, due.lookbackOn);
    assertEquals(afternoon.refresh, { startDate: today, endDate: today });

    for (const days of [1, 2]) {
      const notYet = plan(today, "2026-10-05", shiftDateString(today, -days));
      assertStrictEquals(notYet.refresh.startDate, "2026-10-05");
      assertStrictEquals(notYet.lookbackOn, shiftDateString(today, -days));
    }
  },
);

Deno.test("a missing lookback marker runs the lookback now", () => {
  for (const marker of [null, undefined, "not-a-date"]) {
    const run = planScheduledSyncWindows(
      "2026-10-06",
      FULL_HISTORY("2026-10-06"),
      "2026-10-06",
      marker,
    );
    assertStrictEquals(
      run.refresh.startDate,
      shiftDateString("2026-10-06", -SCHEDULED_LOOKBACK_DAYS),
    );
    assertStrictEquals(run.lookbackOn, "2026-10-06");
  }
});

Deno.test("a gap longer than the lookback keeps the gap start", () => {
  const run = plan("2026-10-06", "2026-09-20", null);
  assertStrictEquals(run.refresh.startDate, "2026-09-20");
});

Deno.test(
  "history is caught up one older slice per run until 120 days are covered",
  () => {
    const today = "2026-10-04";
    const first = planScheduledSyncWindows(today, null, today, today);

    assertEquals(first.refresh, { startDate: today, endDate: today });
    assert(first.catchup);
    assertStrictEquals(first.catchup.endDate, shiftDateString(today, -1));
    assertStrictEquals(
      first.catchup.startDate,
      shiftDateString(today, -SCHEDULED_CATCHUP_DAYS),
    );
    assertStrictEquals(first.historyFrom, first.catchup.startDate);

    const next = planScheduledSyncWindows(
      today,
      first.historyFrom,
      today,
      today,
    );
    assert(next.catchup);
    assertStrictEquals(
      next.catchup.endDate,
      shiftDateString(first.historyFrom, -1),
    );
    assert(next.historyFrom < first.historyFrom);

    let historyFrom: string | null = null;
    for (let run = 0; run < 10; run++) {
      const step = planScheduledSyncWindows(today, historyFrom, today, today);
      if (!step.catchup) break;
      assert(step.catchup.startDate >= FULL_HISTORY(today));
      historyFrom = step.historyFrom;
    }
    assertStrictEquals(historyFrom, FULL_HISTORY(today));
    assertStrictEquals(
      planScheduledSyncWindows(today, historyFrom, today, today).catchup,
      null,
    );
  },
);

Deno.test("a garbage history marker is treated as uncovered", () => {
  const today = "2026-10-04";
  const run = planScheduledSyncWindows(today, "not-a-date", today, today);
  assert(run.catchup);
  assertStrictEquals(run.historyFrom, run.catchup.startDate);
});

Deno.test(
  "jerusalemToday follows the Israel calendar across midnight UTC",
  () => {
    assertStrictEquals(
      jerusalemToday(new Date("2026-10-03T21:30:00Z")),
      "2026-10-04",
    );
    assertStrictEquals(
      jerusalemToday(new Date("2026-10-03T20:30:00Z")),
      "2026-10-03",
    );
  },
);

Deno.test("toDateString uses the calendar day, not the UTC instant", () => {
  assertStrictEquals(toDateString(new Date(2026, 8, 18, 23, 30)), "2026-09-18");
  assertStrictEquals(toDateString(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
});
