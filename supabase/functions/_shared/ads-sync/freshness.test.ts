import { assertStrictEquals } from "jsr:@std/assert@1";

import { isSyncStale } from "../campaign-pulse.ts";
import {
  hasRepeatedSyncFailures,
  resolveSyncOutcome,
  syncOutcomeProblem,
  worstSyncProblem,
} from "./freshness.ts";
import { buildSyncOutcome } from "./outcome.ts";

const NOW = Date.parse("2026-10-26T08:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

Deno.test(
  "syncOutcomeProblem: an empty or failed latest run is a problem",
  () => {
    const lastWrite = iso(NOW - 20 * HOUR);
    for (const status of ["empty", "failed"] as const) {
      const table = {
        last_sync_at: lastWrite,
        last_sync_outcome: buildSyncOutcome({ status, at: iso(NOW - HOUR) }),
      };
      assertStrictEquals(syncOutcomeProblem(table), status);
    }
    assertStrictEquals(
      syncOutcomeProblem({
        last_sync_at: iso(NOW - HOUR),
        last_sync_outcome: buildSyncOutcome({
          status: "partial",
          at: iso(NOW - HOUR),
        }),
      }),
      null,
    );
  },
);

Deno.test(
  "syncOutcomeProblem: an outcome older than the last write is ignored",
  () => {
    assertStrictEquals(
      syncOutcomeProblem({
        last_sync_at: iso(NOW - HOUR),
        integration_settings: {
          last_sync_outcome: {
            status: "failed",
            rows: 0,
            at: iso(NOW - 5 * HOUR),
          },
        },
      }),
      null,
    );
  },
);

Deno.test(
  "resolveSyncOutcome: the newer of column and settings mirror wins",
  () => {
    const outcome = resolveSyncOutcome({
      last_sync_outcome: { status: "ok", rows: 3, at: iso(NOW - 3 * HOUR) },
      integration_settings: {
        last_sync_outcome: { status: "empty", rows: 0, at: iso(NOW - HOUR) },
      },
    });
    assertStrictEquals(outcome?.status, "empty");
    assertStrictEquals(
      resolveSyncOutcome({ last_sync_outcome: { status: "x" } }),
      null,
    );
  },
);

Deno.test(
  "isSyncStale: two runs in a row that did not write are stale, one is not",
  () => {
    const lastWrite = iso(NOW - 10 * HOUR);
    const table = (streak: number) => ({
      last_sync_at: lastWrite,
      integration_settings: {
        last_sync_at: lastWrite,
        sync_failed_streak: streak,
        last_sync_outcome: { status: "failed", rows: 0, at: iso(NOW - HOUR) },
      },
    });
    // One failure: the report pages flag it, the pulse does not alert.
    assertStrictEquals(syncOutcomeProblem(table(1)), "failed");
    assertStrictEquals(hasRepeatedSyncFailures(table(1)), false);
    assertStrictEquals(isSyncStale(table(1), NOW), false);
    // The morning run and the next one both failed.
    assertStrictEquals(hasRepeatedSyncFailures(table(2)), true);
    assertStrictEquals(isSyncStale(table(2), NOW), true);
    // A stored streak that is not a count reads as none.
    assertStrictEquals(
      hasRepeatedSyncFailures({
        integration_settings: { sync_failed_streak: "2" },
      }),
      false,
    );
  },
);

Deno.test(
  "isSyncStale: no write for 30h is stale even without a streak",
  () => {
    const table = { last_sync_at: iso(NOW - 31 * HOUR) };
    assertStrictEquals(isSyncStale(table, NOW), true);
    assertStrictEquals(
      isSyncStale({ last_sync_at: iso(NOW - 29 * HOUR) }, NOW),
      false,
    );
  },
);

Deno.test("worstSyncProblem: failed beats empty", () => {
  assertStrictEquals(worstSyncProblem([null, "empty", "failed"]), "failed");
  assertStrictEquals(worstSyncProblem([null, "empty"]), "empty");
  assertStrictEquals(worstSyncProblem([]), null);
});
