import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import {
  CAMPAIGN_LEVEL_FILTER,
  fetchCampaignLevelRecords,
  fetchTableRecords,
} from "./campaign-records.ts";
import { isRecord } from "./is-record.ts";
import { createFakeDb, fakeClient, type Row } from "./tests/fake-postgrest.ts";

Deno.test(
  "more than 1000 campaign-level rows are read completely, page by page",
  async () => {
    const db = createFakeDb({ crm_records: seedRecords(4500) });
    const expected = db.tables.crm_records.filter((row) => {
      const data = isRecord(row.data) ? row.data : {};
      return (
        String(data.date) >= "2026-09-21" &&
        (!data.entity_level || data.entity_level === "campaign")
      );
    }).length;
    assert(expected > 1000, `fixture has ${expected} matching rows`);

    const rows = await fetchCampaignLevelRecords(fakeClient(db), {
      tableIds: ["t1", "t2"],
      sinceYmd: "2026-09-21",
    });
    assertStrictEquals(rows.length, expected);
    assertStrictEquals(new Set(rows.map((row) => row.id)).size, expected);
    const reads = db.calls.filter((call) => call.op === "select");
    const pages = Math.floor(expected / 1000) + 1;
    assertEquals(
      reads.map((call) => call.range),
      Array.from({ length: pages }, (_, i) => [i * 1000, i * 1000 + 999]),
    );
    assert(reads[0].filters.includes(`or=(${CAMPAIGN_LEVEL_FILTER})`));
    assert(reads[0].filters.includes("data->>date=gte.2026-09-21"));
  },
);

Deno.test(
  "a read error throws instead of returning a partial set",
  async () => {
    const db = createFakeDb({ crm_records: seedRecords(10) });
    db.failures["crm_records:select"] =
      "canceling statement due to statement timeout";
    await assertRejects(
      () =>
        fetchCampaignLevelRecords(fakeClient(db), {
          tableIds: ["t1"],
          sinceYmd: "2026-09-21",
        }),
      Error,
      "statement timeout",
    );
    assertEquals(
      await fetchCampaignLevelRecords(fakeClient(db), {
        tableIds: [],
        sinceYmd: "2026-09-21",
      }),
      [],
    );
  },
);

Deno.test(
  "fetchTableRecords: every row of a table past 1000 rows, any level or date",
  async () => {
    const db = createFakeDb({ crm_records: seedRecords(2500) });
    const expected = db.tables.crm_records.filter(
      (row) => row.table_id === "t1",
    ).length;
    assert(expected > 1000, `fixture has ${expected} rows in t1`);

    const rows = await fetchTableRecords(fakeClient(db), "t1");
    assertStrictEquals(rows.length, expected);
    assertStrictEquals(new Set(rows.map((row) => row.id)).size, expected);
    assertEquals(
      db.calls.map((call) => call.range),
      [
        [0, 999],
        [1000, 1999],
      ],
    );
    assert(db.calls[0].filters.includes("table_id=eq.t1"));
  },
);

Deno.test(
  "a row whose data is not a JSON object comes back with data null",
  async () => {
    const db = createFakeDb({
      crm_records: [
        { id: "r1", table_id: "t1", data: { date: "2026-10-20", spend: 3 } },
        { id: "r2", table_id: "t1", data: "2026-10-20" },
        { id: "r3", table_id: "t1", data: [1, 2] },
        { id: "r4", table_id: "t1", data: null },
      ],
    });

    const rows = await fetchTableRecords(fakeClient(db), "t1");
    assertEquals(rows, [
      { id: "r1", table_id: "t1", data: { date: "2026-10-20", spend: 3 } },
      { id: "r2", table_id: "t1", data: null },
      { id: "r3", table_id: "t1", data: null },
      { id: "r4", table_id: "t1", data: null },
    ]);
  },
);

Deno.test("a row without id or table_id throws", async () => {
  const db = createFakeDb({
    crm_records: [{ table_id: "t1", data: { date: "2026-10-20" } }],
  });

  await assertRejects(
    () => fetchTableRecords(fakeClient(db), "t1"),
    Error,
    "unexpected row shape",
  );
});

/** `count` rows over two tables, mixing levels (some level-less) and dates. */
function seedRecords(count: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const level = i % 3 === 0 ? "campaign" : i % 3 === 1 ? undefined : "adset";
    rows.push({
      id: `r${String(i).padStart(5, "0")}`,
      table_id: i % 2 ? "t1" : "t2",
      tenant_id: "tenant-1",
      data: {
        date: i % 10 === 0 ? "2026-08-01" : "2026-10-20",
        ...(level ? { entity_level: level } : {}),
        spend: 1,
      },
    });
  }
  return rows;
}
