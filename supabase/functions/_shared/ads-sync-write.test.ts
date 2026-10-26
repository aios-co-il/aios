import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { buildAllLevelInsightRecords } from "./fbInsights.ts";
import { replacedRecordsFilter } from "./report-sync-window.ts";
import { scheduledMarkerPatch } from "./sync-outcome.ts";
import { syncOutcomeProblem } from "./sync-freshness.ts";
import {
  replacedLevelRecordsFilter,
  saveSyncRun,
  syncAdsWindow,
  writeAdsWindow,
  type SyncDbClient,
} from "./ads-sync-write.ts";
import { isSyncStale, type CampaignTableLike } from "./campaign-pulse.ts";
import { fakeClient, type FakeDb, type Row } from "./tests/fake-postgrest.ts";
import {
  NOW,
  PREVIOUS_SYNC,
  RUN_AT,
  WINDOW,
  insight,
  storedTable,
  stubGraph,
} from "./tests/meta-graph-fixtures.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The manual / scheduled Meta sync path: fetch, replace, record. */
async function runMetaSync(db: FakeDb, catchup = false, window = WINDOW) {
  const client = fakeClient(db) as unknown as SyncDbClient;
  const fetched = await buildAllLevelInsightRecords(
    "act_1",
    window.startDate,
    window.endDate,
    "token",
    {},
  );
  const outcome = await syncAdsWindow(
    { deleteClient: client },
    {
      tableId: "t1",
      tenantId: "tenant-1",
      window,
      records: fetched.records,
      levelCounts: fetched.levelCounts,
      levelErrors: fetched.levelErrors,
      source: "test",
      at: RUN_AT,
    },
  );
  await saveSyncRun(client, "t1", {
    outcome,
    catchup,
    settingsPatch: scheduledMarkerPatch(outcome.status, {
      scheduled_synced_through: "2026-10-26",
    }),
    log: () => {},
  });
  const table = db.tables.crm_tables[0] as Row & CampaignTableLike;
  return { outcome, table };
}

/** Every stored row as `date:level=spend`, sorted: a duplicate row shows up twice. */
const storedRows = (db: FakeDb) =>
  db.tables.crm_records
    .map((row) => {
      const data = row.data as {
        date: string;
        entity_level?: string;
        spend: number;
      };
      return `${data.date}:${data.entity_level || "none"}=${data.spend}`;
    })
    .sort();

test("a failed campaign-level fetch keeps every stored row and is recorded as failed", async () => {
  stubGraph({
    campaign: "error-on-page-2",
    adset: [[insight("adset", "2026-10-25", "20")]],
    ad: [[insight("ad", "2026-10-25", "21")]],
  });
  const db = storedTable();
  const before = storedRows(db);
  const { outcome, table } = await runMetaSync(db);

  assert.equal(outcome.status, "failed");
  assert.match(outcome.error || "", /User request limit reached/);
  assert.equal(
    db.calls.some((call) => call.op === "delete"),
    false,
  );
  assert.deepEqual(storedRows(db), before);
  assert.equal(table.last_sync_at, PREVIOUS_SYNC);
  const settings = table.integration_settings as Record<string, unknown>;
  assert.equal(settings.last_sync_at, PREVIOUS_SYNC);
  assert.equal(settings.scheduled_synced_through, "2026-10-25");
  assert.equal(settings.currency, "USD");
  assert.equal(table.last_sync_attempt_at, RUN_AT);
  assert.equal(
    (table.last_sync_outcome as { status: string }).status,
    "failed",
  );
  assert.equal(isSyncStale(table, NOW), true);
});

test("a failed ad-level fetch replaces campaign and ad set rows but keeps stored ad rows", async () => {
  stubGraph({
    campaign: [
      [
        insight("campaign", "2026-10-24", "30"),
        insight("campaign", "2026-10-25", "31"),
      ],
    ],
    adset: [[insight("adset", "2026-10-25", "32")]],
    ad: "error-on-page-2",
  });
  const db = storedTable();
  const { outcome, table } = await runMetaSync(db);

  assert.equal(outcome.status, "partial");
  assert.deepEqual(outcome.levels_ok, ["campaign", "adset"]);
  assert.deepEqual(storedRows(db), [
    "2026-06-01:campaign=10",
    "2026-10-23:campaign=11",
    "2026-10-24:campaign=30", // replaced the legacy level-less row
    "2026-10-25:ad=15", // kept: its level failed
    "2026-10-25:adset=32",
    "2026-10-25:campaign=31",
  ]);
  assert.equal(table.last_sync_at, RUN_AT);
  assert.equal(syncOutcomeProblem(table), null);
  assert.equal(
    (table.integration_settings as Record<string, unknown>)
      .scheduled_synced_through,
    "2026-10-26",
  );
});

test("an empty fetch keeps stored rows, marks the run empty and leaves last_sync_at", async () => {
  stubGraph({ campaign: [[]], adset: [[]], ad: [[]] });
  const db = storedTable();
  const before = storedRows(db);
  const { outcome, table } = await runMetaSync(db);

  assert.equal(outcome.status, "empty");
  assert.deepEqual(storedRows(db), before);
  assert.equal(table.last_sync_at, PREVIOUS_SYNC);
  assert.equal(
    (table.integration_settings as Record<string, unknown>)
      .scheduled_synced_through,
    "2026-10-25",
  );
  assert.equal(syncOutcomeProblem(table), "empty");
  assert.equal(isSyncStale(table, NOW), true);
});

test("an empty fetch over days with nothing stored is a clean no-delivery sync", async () => {
  // e.g. the Sunday-morning window over Shabbat, or today before the first impression.
  stubGraph({ campaign: [[]], adset: [[]], ad: [[]] });
  const db = storedTable();
  const before = storedRows(db);
  const today = { startDate: "2026-10-26", endDate: "2026-10-26" };
  const { outcome, table } = await runMetaSync(db, false, today);

  assert.equal(outcome.status, "ok");
  assert.equal(outcome.rows, 0);
  assert.deepEqual(storedRows(db), before);
  assert.equal(
    db.calls.some((call) => call.op === "delete"),
    false,
  );
  assert.equal(table.last_sync_at, RUN_AT);
  assert.equal(syncOutcomeProblem(table), null);
  assert.equal(isSyncStale(table, NOW), false);
});

test("a failed delete inserts nothing; a failed insert chunk is a failed run", async () => {
  const records = [{ date: "2026-10-25", entity_level: "campaign", spend: 1 }];
  const db = storedTable();
  db.failures["crm_records:delete"] = "statement timeout";
  const client = fakeClient(db) as unknown as SyncDbClient;
  const input = {
    tableId: "t1",
    tenantId: "tenant-1",
    window: WINDOW,
    records,
    levelsOk: ["campaign", "adset", "ad"] as const,
  };
  assert.deepEqual(await writeAdsWindow({ deleteClient: client }, input), {
    inserted: 0,
    error: "delete: statement timeout",
  });
  assert.equal(
    db.calls.some((call) => call.op === "insert"),
    false,
  );

  db.failures["crm_records:insert"] = "payload too large";
  const many = Array.from({ length: 3 }, () => records[0]);
  const result = await writeAdsWindow(
    { deleteClient: client },
    { ...input, records: many, chunkSize: 2 },
  );
  assert.deepEqual(result, { inserted: 0, error: "insert: payload too large" });
});

test("catch-up chunks never stamp last_sync_at and record only failures", async () => {
  stubGraph({
    campaign: [[insight("campaign", "2026-10-24", "30")]],
    adset: [[]],
    ad: [[]],
  });
  const ok = storedTable();
  const okRun = await runMetaSync(ok, true);
  assert.equal(okRun.outcome.status, "ok");
  assert.equal(okRun.table.last_sync_at, PREVIOUS_SYNC);
  assert.equal(okRun.table.last_sync_outcome, undefined);

  stubGraph({ campaign: "error-on-page-2", adset: [[]], ad: [[]] });
  const failed = storedTable();
  const failedRun = await runMetaSync(failed, true);
  assert.equal(failedRun.table.last_sync_at, PREVIOUS_SYNC);
  assert.equal(
    (failedRun.table.last_sync_outcome as { status: string }).status,
    "failed",
  );
});

test("replacedLevelRecordsFilter: all levels is the plain window filter", () => {
  assert.equal(
    replacedLevelRecordsFilter("2026-10-24", ["campaign", "adset", "ad"]),
    replacedRecordsFilter("2026-10-24"),
  );
  assert.equal(
    replacedLevelRecordsFilter("2026-10-24", ["campaign"]),
    "and(or(data->>entity_level.is.null,data->>entity_level.in.(campaign)),or(data->>date.gte.2026-10-24,data->>date.is.null,data->>date.lt.1900-01-01))",
  );
});
