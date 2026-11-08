import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { loadTableData, type TableDataDeps } from "./table-data.ts";

const table = {
  id: "t1",
  tenant_id: "tenant-a",
  integration_type: "facebook_insights",
  integration_settings: {},
  category: null,
};
const windows = [
  { eventDate: "10.10", startDate: "2026-10-03", endDate: "2026-10-10" },
  { eventDate: "20.10", startDate: "2026-10-13", endDate: "2026-10-20" },
];
const row = { id: "r1", table_id: "t1", data: { date: "2026-10-05" } };

/** Fake reads that record what the step asked for. */
function fakeDeps(overrides: Partial<TableDataDeps> = {}) {
  const calls: Array<string> = [];
  const deps: TableDataDeps = {
    loadCallerTable: () => Promise.resolve({ data: table, error: null }),
    callerMayReadRows: () => Promise.resolve(true),
    readRecords: (input) => {
      calls.push(
        `records ${input.tableId} ${input.tenantId} ${input.sinceYmd}..${input.untilYmd}`,
      );
      return Promise.resolve([row]);
    },
    probeRecords: (tableId, tenantId) => {
      calls.push(`probe ${tableId} ${tenantId}`);
      return Promise.resolve({ data: [], error: null });
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("loadTableData", () => {
  it("another tenant's table answers 404 and no row is read", async () => {
    const { deps, calls } = fakeDeps({
      loadCallerTable: () => Promise.resolve({ data: null, error: null }),
    });
    assertEquals(await loadTableData(deps, "t1", windows), {
      ok: false,
      status: 404,
      error: "Table not found",
    });
    assertEquals(calls, []);
  });

  it("a table the caller sees but may not read rows of answers the same 404", async () => {
    // A client viewer seeing another client's table in the same tenant.
    const { deps, calls } = fakeDeps({
      callerMayReadRows: () => Promise.resolve(false),
    });
    assertEquals(await loadTableData(deps, "t1", windows), {
      ok: false,
      status: 404,
      error: "Table not found",
    });
    assertEquals(calls, []);
  });

  it("a failed access check answers 500 and no row is read", async () => {
    const { deps, calls } = fakeDeps({
      callerMayReadRows: () => Promise.reject(new Error("rpc down")),
    });
    assertEquals(await loadTableData(deps, "t1", windows), {
      ok: false,
      status: 500,
      error: "Failed to check access",
    });
    assertEquals(calls, []);
  });

  it("reads the rows under the table's tenant over every window", async () => {
    const { deps, calls } = fakeDeps();
    assertEquals(await loadTableData(deps, "t1", windows), {
      ok: true,
      table,
      records: [row],
    });
    assertEquals(calls, ["records t1 tenant-a 2026-10-03..2026-10-20"]);
  });

  it("a records read error or a probe error answers 500", async () => {
    const failedRead = fakeDeps({
      readRecords: () => Promise.reject(new Error("boom")),
    });
    assertEquals(
      (await loadTableData(failedRead.deps, "t1", windows)).ok,
      false,
    );
    const failedProbe = fakeDeps({
      readRecords: () => Promise.resolve([]),
      probeRecords: () => Promise.resolve({ data: null, error: { code: "x" } }),
    });
    assertEquals(await loadTableData(failedProbe.deps, "t1", windows), {
      ok: false,
      status: 500,
      error: "Failed to fetch records",
    });
  });

  it("an empty table answers 404; rows outside the windows still analyse", async () => {
    const empty = fakeDeps({ readRecords: () => Promise.resolve([]) });
    assertEquals(await loadTableData(empty.deps, "t1", windows), {
      ok: false,
      status: 404,
      error: "No records found for this table",
    });
    assertEquals(empty.calls, ["probe t1 tenant-a"]);
    const elsewhere = fakeDeps({
      readRecords: () => Promise.resolve([]),
      probeRecords: () =>
        Promise.resolve({ data: [{ id: "r9" }], error: null }),
    });
    assertEquals(await loadTableData(elsewhere.deps, "t1", windows), {
      ok: true,
      table,
      records: [],
    });
  });
});
