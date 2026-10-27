import { assertStrictEquals } from "jsr:@std/assert@1";

import { isSyncStale } from "../campaign-pulse.ts";
import {
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
  "isSyncStale: a fresh last_sync_at with an empty latest run is stale",
  () => {
    const fresh = iso(NOW - 2 * HOUR);
    assertStrictEquals(isSyncStale({ last_sync_at: fresh }, NOW), false);
    assertStrictEquals(
      isSyncStale(
        {
          last_sync_at: fresh,
          integration_settings: {
            last_sync_at: fresh,
            last_sync_outcome: {
              status: "empty",
              rows: 0,
              at: iso(NOW - HOUR),
            },
          },
        },
        NOW,
      ),
      true,
    );
    assertStrictEquals(
      isSyncStale(
        {
          last_sync_at: fresh,
          last_sync_outcome: { status: "failed", rows: 0, at: iso(NOW - HOUR) },
        },
        NOW,
      ),
      true,
    );
  },
);

Deno.test("worstSyncProblem: failed beats empty", () => {
  assertStrictEquals(worstSyncProblem([null, "empty", "failed"]), "failed");
  assertStrictEquals(worstSyncProblem([null, "empty"]), "empty");
  assertStrictEquals(worstSyncProblem([]), null);
});
