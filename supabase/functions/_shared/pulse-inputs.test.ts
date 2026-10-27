import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import {
  CAMPAIGN_LEVEL_FILTER,
  fetchCampaignLevelRecords,
  pulseClientWindows,
  recordsThrough,
  type RecordsClient,
} from "./pulse-inputs.ts";
import { pulseTrendWindows } from "./pulse-campaign-goals.mjs";
import { computeGoalMetricsFromRecords } from "./campaign-pulse.ts";
import { createFakeDb, fakeClient, type Row } from "./tests/fake-postgrest.ts";

Deno.test(
  "windows: 00:30 in Israel is already the next day (UTC is still the day before)",
  () => {
    // Winter (UTC+2): 2026-10-25T22:30Z is 2026-10-26 00:30 in Jerusalem.
    const w = pulseClientWindows(new Date("2026-10-25T22:30:00.000Z"));
    assertStrictEquals(w.today, "2026-10-26");
    assertStrictEquals(w.end, "2026-10-25");
    assertStrictEquals(w.current7Start, "2026-10-19");
    assertStrictEquals(w.current3Start, "2026-10-23");
    assertStrictEquals(w.previous7Start, "2026-10-12");
    assertStrictEquals(w.queryStart, "2026-09-21");
  },
);

Deno.test(
  "windows: 23:59 in Israel is still the same day (summer, UTC+3)",
  () => {
    const w = pulseClientWindows(new Date("2026-07-14T20:59:00.000Z"));
    assertStrictEquals(w.today, "2026-07-14");
    assertStrictEquals(w.end, "2026-07-13");
    const next = pulseClientWindows(new Date("2026-07-14T21:01:00.000Z"));
    assertStrictEquals(next.today, "2026-07-15");
    assertStrictEquals(next.end, "2026-07-14");
  },
);

Deno.test(
  "windows match campaign_breakdown (pulseTrendWindows) for the same day",
  () => {
    const now = new Date("2026-10-26T05:00:00.000Z");
    const client = pulseClientWindows(now);
    const breakdown = pulseTrendWindows(client.today);
    assertStrictEquals(client.current7Start, breakdown.current7.start);
    assertStrictEquals(client.end, breakdown.current7.end);
    assertStrictEquals(client.current3Start, breakdown.current3.start);
    assertStrictEquals(client.queryStart, breakdown.queryStart);
  },
);

Deno.test(
  "the 7-day client metrics exclude today's partial day and cover 7 full days",
  () => {
    const w = pulseClientWindows(new Date("2026-10-26T05:00:00.000Z"));
    const day = (date: string, spend: number, leads: number) => ({
      data: { date, entity_level: "campaign", spend, leads },
    });
    const rows = [
      day("2026-10-12", 70, 7), // first day of the prior week
      day("2026-10-18", 70, 7), // last day of the prior week
      day("2026-10-19", 100, 5), // first current day
      day("2026-10-25", 100, 5), // yesterday
      day("2026-10-26", 900, 0), // today, partial: must not count
    ];
    const metrics = computeGoalMetricsFromRecords(
      recordsThrough(rows, w.end),
      "leads",
      w.current7Start,
      w.previous7Start,
    );
    assertStrictEquals(metrics.spend, 200);
    assertStrictEquals(metrics.outcomes, 10);
    assertStrictEquals(metrics.efficiency, 20);
    assertStrictEquals(metrics.changePct, 100); // CPL 10 -> 20
  },
);

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

Deno.test(
  "more than 1000 campaign-level rows are read completely, page by page",
  async () => {
    const db = createFakeDb({ crm_records: seedRecords(4500) });
    const expected = db.tables.crm_records.filter((row) => {
      const data = row.data as { date: string; entity_level?: string };
      return (
        data.date >= "2026-09-21" &&
        (!data.entity_level || data.entity_level === "campaign")
      );
    }).length;
    assert(expected > 1000, `fixture has ${expected} matching rows`);

    const rows = await fetchCampaignLevelRecords(
      fakeClient(db) as unknown as RecordsClient,
      { tableIds: ["t1", "t2"], sinceYmd: "2026-09-21" },
    );
    assertStrictEquals(rows.length, expected);
    assertStrictEquals(
      new Set(rows.map((row: { id?: string }) => row.id)).size,
      expected,
    );
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
        fetchCampaignLevelRecords(fakeClient(db) as unknown as RecordsClient, {
          tableIds: ["t1"],
          sinceYmd: "2026-09-21",
        }),
      Error,
      "statement timeout",
    );
    assertEquals(
      await fetchCampaignLevelRecords(
        fakeClient(db) as unknown as RecordsClient,
        {
          tableIds: [],
          sinceYmd: "2026-09-21",
        },
      ),
      [],
    );
  },
);
