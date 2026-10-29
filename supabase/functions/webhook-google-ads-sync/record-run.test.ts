import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { resolveSyncOutcome } from "../_shared/ads-sync/freshness.ts";
import { fakeClient } from "../_shared/ads-sync/tests/fake-postgrest.ts";
import {
  PREVIOUS_SYNC,
  storedTable,
  storedTableRow,
} from "../_shared/ads-sync/tests/meta-graph-fixtures.ts";
import { recordWebhookRun } from "./record-run.ts";

const TABLE_ROW = {
  id: "t1",
  tenant_id: "tenant-1",
  integration_settings: { currency: "USD" },
};

Deno.test(
  "recordWebhookRun: any failed write keeps last_sync_at and records a failed run",
  async () => {
    const db = storedTable();
    await recordWebhookRun(fakeClient(db), TABLE_ROW, {
      written: 40,
      writeErrors: 2,
    });

    const row = storedTableRow(db);
    const column = resolveSyncOutcome({
      last_sync_outcome: row.last_sync_outcome,
    });
    assertEquals(
      [column?.status, column?.rows, column?.error, column?.source],
      ["failed", 40, "2 writes failed", "webhook-google-ads-sync"],
    );
    assertStrictEquals(row.last_sync_at, PREVIOUS_SYNC);
    assertStrictEquals(row.integration_settings.last_sync_at, PREVIOUS_SYNC);
  },
);

Deno.test(
  "recordWebhookRun: a clean write stamps last_sync_at; nothing written is empty",
  async () => {
    const ok = storedTable();
    await recordWebhookRun(fakeClient(ok), TABLE_ROW, {
      written: 12,
      writeErrors: 0,
    });
    const okRow = storedTableRow(ok);
    assertStrictEquals(resolveSyncOutcome(okRow)?.status, "ok");
    assert(okRow.last_sync_at !== PREVIOUS_SYNC);
    assertStrictEquals(
      okRow.integration_settings.last_sync_at,
      okRow.last_sync_at,
    );

    const empty = storedTable();
    await recordWebhookRun(fakeClient(empty), TABLE_ROW, {
      written: 0,
      writeErrors: 0,
    });
    const emptyRow = storedTableRow(empty);
    assertStrictEquals(resolveSyncOutcome(emptyRow)?.status, "empty");
    assertStrictEquals(emptyRow.last_sync_at, PREVIOUS_SYNC);
  },
);
