import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSyncOutcome,
  finalizeSyncOutcome,
  planLevelWrite,
  scheduledMarkerPatch,
} from "./sync-outcome.ts";
import {
  resolveSyncOutcome,
  syncOutcomeProblem,
  worstSyncProblem,
} from "./sync-freshness.ts";
import { isSyncStale } from "./campaign-pulse.ts";

const NOW = Date.parse("2026-10-26T08:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

test("planLevelWrite: a failed campaign level aborts the window", () => {
  const plan = planLevelWrite({
    levelCounts: { campaign: 0, adset: 40, ad: 120 },
    levelErrors: { campaign: "(#17) User request limit reached" },
  });
  assert.equal(plan.write, false);
  assert.equal(plan.status, "failed");
  assert.deepEqual(plan.levelsOk, ["adset", "ad"]);
  assert.match(plan.error || "", /campaign level fetch failed/);
});

test("planLevelWrite: a failed ad set / ad level is partial and skips that level", () => {
  const plan = planLevelWrite({
    levelCounts: { campaign: 14, adset: 30, ad: 0 },
    levelErrors: { ad: "Please reduce the amount of data" },
  });
  assert.equal(plan.write, true);
  assert.equal(plan.status, "partial");
  assert.deepEqual(plan.levelsOk, ["campaign", "adset"]);
  assert.equal(plan.rows, 44);
});

test("planLevelWrite: nothing fetched is empty, or failed when a level errored", () => {
  assert.deepEqual(
    planLevelWrite({ levelCounts: { campaign: 0, adset: 0, ad: 0 } }),
    {
      write: false,
      status: "empty",
      levelsOk: ["campaign", "adset", "ad"],
      rows: 0,
    },
  );
  const failed = planLevelWrite({
    levelCounts: { campaign: 0, adset: 0, ad: 0 },
    levelErrors: { adset: "timeout" },
  });
  assert.equal(failed.write, false);
  assert.equal(failed.status, "failed");
});

test("planLevelWrite: lower levels without campaign rows never replace the window", () => {
  const plan = planLevelWrite({
    levelCounts: { campaign: 0, adset: 5, ad: 9 },
  });
  assert.equal(plan.write, false);
  assert.equal(plan.status, "failed");
});

test("planLevelWrite: a clean fetch is ok over every level", () => {
  const plan = planLevelWrite({
    levelCounts: { campaign: 7, adset: 0, ad: 0 },
  });
  assert.equal(plan.write, true);
  assert.equal(plan.status, "ok");
  assert.deepEqual(plan.levelsOk, ["campaign", "adset", "ad"]);
});

test("finalizeSyncOutcome: a write error turns the run into failed", () => {
  const plan = planLevelWrite({ levelCounts: { campaign: 600 } });
  const at = "2026-10-26T04:40:00.000Z";
  assert.deepEqual(
    finalizeSyncOutcome(
      plan,
      { inserted: 500, error: "insert: timeout" },
      { at },
    ),
    {
      status: "failed",
      rows: 500,
      levels_ok: ["campaign", "adset", "ad"],
      error: "insert: timeout",
      at,
    },
  );
  assert.equal(
    finalizeSyncOutcome(plan, { inserted: 600 }, { at }).status,
    "ok",
  );
});

test("scheduledMarkerPatch: markers advance only past a successful write", () => {
  const markers = {
    scheduled_history_from: "2026-06-28",
    scheduled_synced_through: "2026-10-26",
    scheduled_lookback_on: "2026-10-26",
  };
  assert.deepEqual(scheduledMarkerPatch("failed", markers), {});
  assert.deepEqual(scheduledMarkerPatch("empty", markers), {
    scheduled_history_from: "2026-06-28",
  });
  assert.deepEqual(scheduledMarkerPatch("partial", markers), markers);
  assert.deepEqual(
    scheduledMarkerPatch("ok", { scheduled_synced_through: "bad" }),
    {},
  );
});

test("syncOutcomeProblem: an empty or failed latest run is a problem", () => {
  const lastWrite = iso(NOW - 20 * HOUR);
  for (const status of ["empty", "failed"] as const) {
    const table = {
      last_sync_at: lastWrite,
      last_sync_outcome: buildSyncOutcome({ status, at: iso(NOW - HOUR) }),
    };
    assert.equal(syncOutcomeProblem(table), status);
  }
  assert.equal(
    syncOutcomeProblem({
      last_sync_at: iso(NOW - HOUR),
      last_sync_outcome: buildSyncOutcome({
        status: "partial",
        at: iso(NOW - HOUR),
      }),
    }),
    null,
  );
});

test("syncOutcomeProblem: an outcome older than the last write is ignored", () => {
  assert.equal(
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
});

test("resolveSyncOutcome: the newer of column and settings mirror wins", () => {
  const outcome = resolveSyncOutcome({
    last_sync_outcome: { status: "ok", rows: 3, at: iso(NOW - 3 * HOUR) },
    integration_settings: {
      last_sync_outcome: { status: "empty", rows: 0, at: iso(NOW - HOUR) },
    },
  });
  assert.equal(outcome?.status, "empty");
  assert.equal(
    resolveSyncOutcome({ last_sync_outcome: { status: "x" } }),
    null,
  );
});

test("isSyncStale: a fresh last_sync_at with an empty latest run is stale", () => {
  const fresh = iso(NOW - 2 * HOUR);
  assert.equal(isSyncStale({ last_sync_at: fresh }, NOW), false);
  assert.equal(
    isSyncStale(
      {
        last_sync_at: fresh,
        integration_settings: {
          last_sync_at: fresh,
          last_sync_outcome: { status: "empty", rows: 0, at: iso(NOW - HOUR) },
        },
      },
      NOW,
    ),
    true,
  );
  assert.equal(
    isSyncStale(
      {
        last_sync_at: fresh,
        last_sync_outcome: { status: "failed", rows: 0, at: iso(NOW - HOUR) },
      },
      NOW,
    ),
    true,
  );
});

test("worstSyncProblem: failed beats empty", () => {
  assert.equal(worstSyncProblem([null, "empty", "failed"]), "failed");
  assert.equal(worstSyncProblem([null, "empty"]), "empty");
  assert.equal(worstSyncProblem([]), null);
});
