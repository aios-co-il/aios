import { assertEquals } from "jsr:@std/assert@1";

import { isRecord } from "./is-record.ts";
import { ADS_LEVELS } from "./levels.ts";
import { storedTable } from "./tests/meta-graph-fixtures.ts";
import { fakeClient } from "./tests/fake-postgrest.ts";
import { writeAdsWindow } from "./write-window.ts";

Deno.test(
  "a catch-up slice in the past replaces its own days and keeps every newer day",
  async () => {
    // The scheduled catch-up fetches an older slice. Before the delete had an
    // end, it wiped every stored day after the slice (Eco, 2026-11-14).
    const db = storedTable();
    const result = await writeAdsWindow(
      { deleteClient: fakeClient(db) },
      {
        tableId: "t1",
        tenantId: "tenant-1",
        levelsOk: ADS_LEVELS,
        window: { startDate: "2026-05-31", endDate: "2026-06-01" },
        records: [{ date: "2026-06-01" }],
      },
    );
    assertEquals(result, { inserted: 1 });
    const dates = db.tables.crm_records
      .map((row) => (isRecord(row.data) ? String(row.data.date) : ""))
      .sort();
    assertEquals(dates, [
      "2026-06-01",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-25",
      "2026-10-25",
    ]);
  },
);
