import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSyncOutcome,
  finalizeSyncOutcome,
  planLevelWrite,
  redactSyncError,
  scheduledMarkerPatch,
} from "./sync-outcome.ts";
import {
  resolveSyncOutcome,
  syncOutcomeProblem,
  worstSyncProblem,
} from "./sync-freshness.ts";
import { isSyncStale } from "./campaign-pulse.ts";
import { saveSyncRun, type SyncDbClient } from "./ads-sync-write.ts";
import { fakeClient } from "./tests/fake-postgrest.ts";
import { RUN_AT, storedTable } from "./tests/meta-graph-fixtures.ts";

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

test("planLevelWrite: nothing fetched is empty, even when a lower level errored", () => {
  assert.deepEqual(
    planLevelWrite({ levelCounts: { campaign: 0, adset: 0, ad: 0 } }),
    {
      write: false,
      status: "empty",
      levelsOk: ["campaign", "adset", "ad"],
      rows: 0,
    },
  );
  // A clean, empty campaign level already proves there was no delivery.
  assert.deepEqual(
    planLevelWrite({
      levelCounts: { campaign: 0, adset: 0, ad: 0 },
      levelErrors: { adset: "timeout" },
    }),
    { write: false, status: "empty", levelsOk: ["campaign", "ad"], rows: 0 },
  );
  // Without a campaign level to vouch for it, a failed level is a failed run.
  const failed = planLevelWrite({
    levels: ["adset", "ad"],
    levelCounts: { adset: 0, ad: 0 },
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

// Meta puts the access token in the request URL; Deno's transport errors print it.
const TOKEN = "EAAB123abcDEF456ghiJKL789mnoPQR012stuVWX345yz";
const denoSendError = (url: string) =>
  `error sending request for url (${url}): client error (SendRequest): connection closed before message completed`;
const FIRST_PAGE_URL = `https://graph.facebook.com/v21.0/act_123/insights?access_token=${TOKEN}&level=ad&fields=campaign_id,spend&time_increment=1`;
// paging.next: the token follows the `?` directly.
const NEXT_PAGE_URL = `https://graph.facebook.com/v21.0/act_123/insights?access_token=${TOKEN}&after=QVFIUjZA`;

test("redactSyncError: removes Meta and Google credentials and is idempotent", () => {
  const cases = [
    denoSendError(FIRST_PAGE_URL),
    denoSendError(NEXT_PAGE_URL),
    `https://graph.facebook.com/v21.0/act_123?fields=account_status&access_token=${TOKEN}`,
    `{"error":"invalid","access_token": "${TOKEN}"}`,
    `request failed: Authorization: Bearer ya29.a0AfB_byC-xyz.123`,
    `token ${TOKEN} expired`,
  ];
  for (const text of cases) {
    const redacted = redactSyncError(text);
    assert.equal(redacted.includes(TOKEN), false, redacted);
    assert.equal(redacted.includes("ya29."), false, redacted);
    assert.match(redacted, /\[redacted\]/);
    assert.equal(redactSyncError(redacted), redacted);
  }
  assert.equal(
    redactSyncError(denoSendError(FIRST_PAGE_URL)),
    "error sending request for url (https://graph.facebook.com/v21.0/act_123/insights?[redacted]): client error (SendRequest): connection closed before message completed",
  );
  assert.equal(
    redactSyncError("(#17) User request limit reached"),
    "(#17) User request limit reached",
  );
});

test("buildSyncOutcome: redacts before the 300-char cut", () => {
  // The cut lands inside the token: truncating first would keep its first half.
  const prefix = "x".repeat(250);
  const outcome = buildSyncOutcome({
    status: "failed",
    error: `${prefix} access_token=${TOKEN}&level=campaign`,
  });
  assert.equal(outcome.error?.includes(TOKEN.slice(0, 20)), false);
  assert.match(outcome.error || "", /access_token=\[redacted\]/);
});

test("a token in a level error reaches neither the outcome nor the settings mirror", async () => {
  const partial = finalizeSyncOutcome(
    planLevelWrite({
      levelCounts: { campaign: 4, adset: 6, ad: 0 },
      levelErrors: { ad: denoSendError(NEXT_PAGE_URL) },
    }),
    { inserted: 10 },
    { at: RUN_AT, source: "test" },
  );
  const failed = finalizeSyncOutcome(
    planLevelWrite({
      levelCounts: { campaign: 0, adset: 6, ad: 9 },
      levelErrors: { campaign: denoSendError(FIRST_PAGE_URL) },
    }),
    null,
    { at: RUN_AT, source: "test" },
  );
  assert.equal(partial.status, "partial");
  assert.equal(failed.status, "failed");

  for (const outcome of [partial, failed]) {
    assert.equal(JSON.stringify(outcome).includes(TOKEN), false);
    assert.match(outcome.error || "", /\[redacted\]/);

    const db = storedTable();
    const client = fakeClient(db) as unknown as SyncDbClient;
    // Also a caller that built its outcome by hand, without buildSyncOutcome.
    const raw = { ...outcome, error: denoSendError(FIRST_PAGE_URL) };
    for (const candidate of [outcome, raw]) {
      await saveSyncRun(client, "t1", { outcome: candidate, log: () => {} });
      const table = db.tables.crm_tables[0];
      const settings = table.integration_settings as Record<string, unknown>;
      const mirror = settings.last_sync_outcome as Record<string, unknown>;
      const column = table.last_sync_outcome as Record<string, unknown>;

      assert.equal(JSON.stringify(table).includes(TOKEN), false);
      assert.equal("error" in mirror, false);
      assert.deepEqual(Object.keys(mirror).sort(), [
        "at",
        "levels_ok",
        "rows",
        "source",
        "status",
      ]);
      assert.equal(mirror.status, outcome.status);
      assert.match(String(column.error), /\[redacted\]/);
      // The stale check still reads the status from the mirror.
      assert.equal(
        resolveSyncOutcome({ integration_settings: settings })?.status,
        outcome.status,
      );
    }
  }
});

test("redacts percent-encoded, single-quoted and hyphenated credentials", () => {
  const encoded = redactSyncError(
    "fetch failed: https%3A%2F%2Fgraph.facebook.com%2Fv21.0%2Fact_1%2Finsights%3Faccess_token%3DEAAB1234567890abcdefghijklmnop",
  );
  assert.doesNotMatch(encoded, /EAAB1234567890/);
  const quoted = redactSyncError("{'access_token': 'secret-value-1'}");
  assert.doesNotMatch(quoted, /secret-value-1/);
  const hyphen = redactSyncError("developer-token: dev-secret-2");
  assert.doesNotMatch(hyphen, /dev-secret-2/);
  assert.equal(redactSyncError(redactSyncError(encoded)), encoded);
});
