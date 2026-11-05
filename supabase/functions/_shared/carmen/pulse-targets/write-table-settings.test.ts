import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { fakeDb } from "./fake-db.ts";
import { seed } from "./test-fixtures.ts";
import {
  TABLE_NOT_WRITTEN,
  TABLE_WRITE_FAILED,
  writeTableSettings,
} from "./write-table-settings.ts";

const WRITE = {
  tableId: "t-meta",
  tenantIds: ["tenant-1"],
  settings: { pulse_targets: {} },
};

Deno.test(
  "writeTableSettings writes the table in the given tenants",
  async () => {
    const db = fakeDb(seed());
    assertStrictEquals(await writeTableSettings(db, WRITE), null);
    const [write] = db.writes;
    assertEquals(write.filters, ["id", "tenant_id"]);
    assertEquals(write.rows[0].integration_settings, WRITE.settings);
  },
);

Deno.test(
  "writeTableSettings reports a write that matched no table",
  async () => {
    const otherTenant = fakeDb(seed());
    assertStrictEquals(
      await writeTableSettings(otherTenant, {
        ...WRITE,
        tenantIds: ["tenant-2"],
      }),
      TABLE_NOT_WRITTEN,
    );
    const deleted = fakeDb(seed(), {
      table: "crm_tables",
      op: "update",
      noMatch: true,
    });
    assertStrictEquals(
      await writeTableSettings(deleted, WRITE),
      TABLE_NOT_WRITTEN,
    );
  },
);

Deno.test(
  "writeTableSettings logs the database error and returns a generic reason",
  async () => {
    const db = fakeDb(seed(), { table: "crm_tables", op: "update" });
    const logged: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => logged.push(args);
    try {
      assertStrictEquals(
        await writeTableSettings(db, WRITE),
        TABLE_WRITE_FAILED,
      );
    } finally {
      console.error = originalError;
    }
    assertMatch(JSON.stringify(logged), /crm_tables update failed/);
  },
);
