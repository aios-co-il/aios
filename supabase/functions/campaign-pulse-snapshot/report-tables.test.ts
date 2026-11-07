/**
 * The snapshot's report tables (AIO-501): switched-off tables are kept apart
 * from the active ones that feed the campaign alerts, and only their spend in
 * the last 3 full days is read.
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { RecordsClient } from "../_shared/ads-sync/campaign-records.ts";
import {
  loadOffReportSpend,
  type PulseReportTable,
  splitReportTables,
} from "./report-tables.ts";

const WINDOW = { start: "2026-11-04", end: "2026-11-06" };

const ARCHI_OFF: PulseReportTable = {
  id: "t-off",
  client_id: "c1",
  name: "Archi.Salt",
  campaign_active: false,
};

type Row = { id: string; table_id: string; data: Record<string, unknown> };

/** crm_records in memory; records every table list and date bound it is asked for. */
function fakeRecords(rows: Array<Row>, failing = false) {
  const calls: Array<{ tableIds: unknown; since: unknown }> = [];
  const client: RecordsClient = {
    from: () => ({
      select: () => {
        const filters: Array<(row: Row) => boolean> = [];
        const call: { tableIds: unknown; since: unknown } = {
          tableIds: null,
          since: null,
        };
        calls.push(call);
        const query = {
          eq: () => query,
          in: (_column: string, values: ReadonlyArray<string>) => {
            call.tableIds = values;
            filters.push((row) => values.includes(row.table_id));
            return query;
          },
          or: () => query,
          gte: (_column: string, value: string) => {
            call.since = value;
            filters.push((row) => String(row.data.date) >= value);
            return query;
          },
          lte: () => query,
          order: () => query,
          range: (from: number, to: number) =>
            Promise.resolve(
              failing
                ? { data: null, error: { message: "connection reset" } }
                : {
                    data: rows
                      .filter((row) => filters.every((keep) => keep(row)))
                      .slice(from, to + 1),
                    error: null,
                  },
            ),
        };
        return query;
      },
    }),
  };
  return { client, calls };
}

Deno.test("splitReportTables", async (t) => {
  await t.step("a switched-off table is never among the active ones", () => {
    const active = { ...ARCHI_OFF, id: "t-on", campaign_active: true };
    const legacy = { ...ARCHI_OFF, id: "t-legacy", campaign_active: null };
    const split = splitReportTables([ARCHI_OFF, active, legacy], () => true);
    assertEquals(
      split.activeByClient.get("c1")?.map((table) => table.id),
      ["t-on", "t-legacy"],
    );
    assertEquals(
      split.offByClient.get("c1")?.map((table) => table.id),
      ["t-off"],
    );
  });

  await t.step("leaves out tables the pulse does not read", () => {
    const split = splitReportTables(
      [ARCHI_OFF, { ...ARCHI_OFF, id: "t-orphan", client_id: null }],
      (table) => table.id !== "t-off",
    );
    assertEquals(split.offByClient.size, 0);
    assertEquals(split.activeByClient.size, 0);
  });
});

Deno.test("loadOffReportSpend", async (t) => {
  await t.step(
    "sums each table's spend over the last 3 full days, without today",
    async () => {
      const { client, calls } = fakeRecords([
        {
          id: "1",
          table_id: "t-off",
          data: { date: "2026-11-03", spend: 900 },
        },
        {
          id: "2",
          table_id: "t-off",
          data: { date: "2026-11-04", spend: 100 },
        },
        {
          id: "3",
          table_id: "t-off",
          data: { date: "2026-11-06", cost: 183.4 },
        },
        { id: "4", table_id: "t-off", data: { date: "2026-11-07", spend: 50 } },
      ]);
      const spend = await loadOffReportSpend(client, [ARCHI_OFF], WINDOW);
      assertEquals(spend, [
        {
          table_id: "t-off",
          table_name: "Archi.Salt",
          spend_3d: 283.4,
          window_start: "2026-11-04",
          window_end: "2026-11-06",
        },
      ]);
      assertEquals(calls, [{ tableIds: ["t-off"], since: "2026-11-04" }]);
    },
  );

  await t.step("a table with no spend in the window is left out", async () => {
    const { client } = fakeRecords([
      { id: "1", table_id: "t-off", data: { date: "2026-11-05", spend: 0 } },
    ]);
    assertEquals(await loadOffReportSpend(client, [ARCHI_OFF], WINDOW), []);
  });

  await t.step("no switched-off table reads nothing", async () => {
    const { client, calls } = fakeRecords([]);
    assertEquals(await loadOffReportSpend(client, [], WINDOW), []);
    assertEquals(calls.length, 0);
  });

  await t.step(
    "a read error throws instead of reporting no spend",
    async () => {
      const { client } = fakeRecords([], true);
      await assertRejects(() =>
        loadOffReportSpend(client, [ARCHI_OFF], WINDOW),
      );
    },
  );
});
