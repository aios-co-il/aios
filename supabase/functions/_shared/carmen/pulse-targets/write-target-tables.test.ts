import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { at } from "../../pulse/test-fixtures.ts";
import { fakeDb, type FailOn } from "./fake-db.ts";
import { seed, settingsOf } from "./test-fixtures.ts";
import { TABLE_NOT_WRITTEN } from "./write-table-settings.ts";
import { writeTargetToTables } from "./write-target-tables.ts";

const MARKET = { cpl: 90, source: "carmen_market", rationale: "בנצ׳מרק" };

/** client-1 with two Meta tables holding Carmen's market CPL. */
function twoMetaTables(...failOn: FailOn[]) {
  const tables = seed({ pulse_platform_targets: { leads: MARKET } });
  tables.crm_tables.push({
    ...tables.crm_tables[0],
    id: "t-meta-2",
    integration_settings: { pulse_platform_targets: { leads: MARKET } },
  });
  return fakeDb(tables, failOn);
}

/** An approved platform CPL of 70 written to both Meta tables. */
function writeCpl70(db: ReturnType<typeof twoMetaTables>) {
  return writeTargetToTables(db, {
    tables: db.tables.crm_tables
      .filter((t) => t.integration_type === "facebook_insights")
      .map((t) => ({
        id: String(t.id),
        integration_settings: structuredClone(t.integration_settings),
      })),
    tenantIds: ["tenant-1"],
    patch: { goal: "leads", kind: "cpl", value: 70, source: "approved" },
  });
}

Deno.test("writeTargetToTables writes the target to every table", async () => {
  const db = twoMetaTables();
  assertEquals(await writeCpl70(db), { ok: true });
  for (const id of ["t-meta", "t-meta-2"]) {
    assertStrictEquals(
      at(settingsOf(db, id), "pulse_platform_targets", "leads", "cpl"),
      70,
    );
  }
});

Deno.test(
  "writeTargetToTables puts the old target back when a later table takes no write",
  async () => {
    const db = twoMetaTables({
      table: "crm_tables",
      op: "update",
      id: "t-meta-2",
      noMatch: true,
    });
    assertEquals(await writeCpl70(db), {
      ok: false,
      error: TABLE_NOT_WRITTEN,
      stillWritten: [],
    });
    assertEquals(settingsOf(db, "t-meta"), {
      last_sync_at: "2026-10-26",
      pulse_platform_targets: { leads: MARKET },
    });
    // The restore read the table again and wrote it once more.
    const writes = db.writes.filter((w) => w.table === "crm_tables");
    assertEquals(
      writes.map((w) => w.filters),
      [
        ["id", "tenant_id"],
        ["id", "tenant_id"],
        ["id", "tenant_id"],
      ],
    );
  },
);

Deno.test(
  "writeTargetToTables names a table whose restore failed too",
  async () => {
    const db = twoMetaTables(
      { table: "crm_tables", op: "update", id: "t-meta-2" },
      { table: "crm_tables", op: "select", id: "t-meta" },
    );
    const originalError = console.error;
    console.error = () => {};
    try {
      assertEquals(await writeCpl70(db), {
        ok: false,
        error: "crm_tables update failed",
        stillWritten: ["t-meta"],
      });
    } finally {
      console.error = originalError;
    }
    assertStrictEquals(
      at(settingsOf(db, "t-meta"), "pulse_platform_targets", "leads", "cpl"),
      70,
    );
  },
);
