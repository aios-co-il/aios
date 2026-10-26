import assert from "node:assert/strict";
import test from "node:test";

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

test("windows: 00:30 in Israel is already the next day (UTC is still the day before)", () => {
  // Winter (UTC+2): 2026-10-25T22:30Z is 2026-10-26 00:30 in Jerusalem.
  const w = pulseClientWindows(new Date("2026-10-25T22:30:00.000Z"));
  assert.equal(w.today, "2026-10-26");
  assert.equal(w.end, "2026-10-25");
  assert.equal(w.current7Start, "2026-10-19");
  assert.equal(w.current3Start, "2026-10-23");
  assert.equal(w.previous7Start, "2026-10-12");
  assert.equal(w.queryStart, "2026-09-21");
});

test("windows: 23:59 in Israel is still the same day (summer, UTC+3)", () => {
  const w = pulseClientWindows(new Date("2026-07-14T20:59:00.000Z"));
  assert.equal(w.today, "2026-07-14");
  assert.equal(w.end, "2026-07-13");
  const next = pulseClientWindows(new Date("2026-07-14T21:01:00.000Z"));
  assert.equal(next.today, "2026-07-15");
  assert.equal(next.end, "2026-07-14");
});

test("windows match campaign_breakdown (pulseTrendWindows) for the same day", () => {
  const now = new Date("2026-10-26T05:00:00.000Z");
  const client = pulseClientWindows(now);
  const breakdown = pulseTrendWindows(client.today);
  assert.equal(client.current7Start, breakdown.current7.start);
  assert.equal(client.end, breakdown.current7.end);
  assert.equal(client.current3Start, breakdown.current3.start);
  assert.equal(client.queryStart, breakdown.queryStart);
});

test("the 7-day client metrics exclude today's partial day and cover 7 full days", () => {
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
  assert.equal(metrics.spend, 200);
  assert.equal(metrics.outcomes, 10);
  assert.equal(metrics.efficiency, 20);
  assert.equal(metrics.changePct, 100); // CPL 10 -> 20
});

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

test("more than 1000 campaign-level rows are read completely, page by page", async () => {
  const db = createFakeDb({ crm_records: seedRecords(4500) });
  const expected = db.tables.crm_records.filter((row) => {
    const data = row.data as { date: string; entity_level?: string };
    return (
      data.date >= "2026-09-21" &&
      (!data.entity_level || data.entity_level === "campaign")
    );
  }).length;
  assert.ok(expected > 1000, `fixture has ${expected} matching rows`);

  const rows = await fetchCampaignLevelRecords(
    fakeClient(db) as unknown as RecordsClient,
    { tableIds: ["t1", "t2"], sinceYmd: "2026-09-21" },
  );
  assert.equal(rows.length, expected);
  assert.equal(
    new Set(rows.map((row: { id?: string }) => row.id)).size,
    expected,
  );
  const reads = db.calls.filter((call) => call.op === "select");
  const pages = Math.floor(expected / 1000) + 1;
  assert.deepEqual(
    reads.map((call) => call.range),
    Array.from({ length: pages }, (_, i) => [i * 1000, i * 1000 + 999]),
  );
  assert.ok(reads[0].filters.includes(`or=(${CAMPAIGN_LEVEL_FILTER})`));
  assert.ok(reads[0].filters.includes("data->>date=gte.2026-09-21"));
});

test("a read error throws instead of returning a partial set", async () => {
  const db = createFakeDb({ crm_records: seedRecords(10) });
  db.failures["crm_records:select"] =
    "canceling statement due to statement timeout";
  await assert.rejects(
    fetchCampaignLevelRecords(fakeClient(db) as unknown as RecordsClient, {
      tableIds: ["t1"],
      sinceYmd: "2026-09-21",
    }),
    /statement timeout/,
  );
  assert.deepEqual(
    await fetchCampaignLevelRecords(
      fakeClient(db) as unknown as RecordsClient,
      {
        tableIds: [],
        sinceYmd: "2026-09-21",
      },
    ),
    [],
  );
});
