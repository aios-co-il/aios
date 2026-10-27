import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { resolveSyncOutcome } from "./freshness.ts";
import { isRecord } from "./is-record.ts";
import { finalizeSyncOutcome, planLevelWrite } from "./level-plan.ts";
import { buildSyncOutcome } from "./outcome.ts";
import { failedRunRecorder, saveSyncRun } from "./save-run.ts";
import type { SyncDbClient } from "./write-window.ts";
import { fakeClient } from "./tests/fake-postgrest.ts";
import {
  PREVIOUS_SYNC,
  RUN_AT,
  TABLE,
  settingsOf,
  storedTable,
  storedTableRow,
} from "./tests/meta-graph-fixtures.ts";
import {
  FIRST_PAGE_URL,
  NEXT_PAGE_URL,
  TOKEN,
  denoSendError,
} from "./tests/token-errors.ts";

Deno.test(
  "a token in a level error reaches neither the outcome nor the settings mirror",
  async () => {
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
    assertStrictEquals(partial.status, "partial");
    assertStrictEquals(failed.status, "failed");

    for (const outcome of [partial, failed]) {
      assertStrictEquals(JSON.stringify(outcome).includes(TOKEN), false);
      assertMatch(outcome.error || "", /\[redacted\]/);

      const db = storedTable();
      const client = fakeClient(db);
      // Also a caller that built its outcome by hand, without buildSyncOutcome.
      const raw = { ...outcome, error: denoSendError(FIRST_PAGE_URL) };
      for (const candidate of [outcome, raw]) {
        await saveSyncRun(client, TABLE, { outcome: candidate, log: () => {} });
        const table = db.tables.crm_tables[0];
        const settings = settingsOf(table);
        const mirror = settings.last_sync_outcome;
        const column = table.last_sync_outcome;
        assert(isRecord(mirror) && isRecord(column));

        assertStrictEquals(JSON.stringify(table).includes(TOKEN), false);
        assertStrictEquals("error" in mirror, false);
        assertEquals(Object.keys(mirror).sort(), [
          "at",
          "levels_ok",
          "rows",
          "source",
          "status",
        ]);
        assertStrictEquals(mirror.status, outcome.status);
        assertMatch(String(column.error), /\[redacted\]/);
        // The stale check still reads the status from the mirror.
        assertStrictEquals(
          resolveSyncOutcome({ integration_settings: settings })?.status,
          outcome.status,
        );
      }
    }
  },
);

Deno.test("saveSyncRun: a row of another tenant is left alone", async () => {
  const db = storedTable();
  const before = structuredClone(db.tables.crm_tables);
  await saveSyncRun(
    fakeClient(db),
    { tableId: "t1", tenantId: "other-tenant" },
    { outcome: buildSyncOutcome({ status: "ok", rows: 3, at: RUN_AT }) },
  );

  assertEquals(db.tables.crm_tables, before);
  const tableCalls = db.calls.filter((call) => call.table === "crm_tables");
  assertStrictEquals(tableCalls.length, 3);
  for (const call of tableCalls) {
    assert(call.filters.includes("tenant_id=eq.other-tenant"), call.op);
  }
});

Deno.test(
  "failedRunRecorder: records a failed run and never throws",
  async () => {
    const db = storedTable();
    await failedRunRecorder(fakeClient(db), { ...TABLE, source: "test" })(
      denoSendError(FIRST_PAGE_URL),
    );
    const row = storedTableRow(db);
    const column = resolveSyncOutcome({
      last_sync_outcome: row.last_sync_outcome,
    });
    assertStrictEquals(column?.status, "failed");
    assertStrictEquals(column?.source, "test");
    assertStrictEquals(row.last_sync_at, PREVIOUS_SYNC);
    assertStrictEquals(JSON.stringify(db.tables).includes(TOKEN), false);

    const unreachable: SyncDbClient = {
      from() {
        throw new Error("network down");
      },
    };
    const logged: unknown[][] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      await failedRunRecorder(unreachable, { ...TABLE, source: "test" })(
        "boom",
      );
    } finally {
      console.error = realError;
    }
    assertEquals(logged, [
      ["[test] recording failed run failed:", "network down"],
    ]);
  },
);
