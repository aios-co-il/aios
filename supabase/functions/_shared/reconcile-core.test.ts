import {
  assert,
  assertEquals,
  assertFalse,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  type CampaignDayRow,
  compareCampaignDays,
  completeDaysWindow,
  createFixtureSource,
  exceedsTolerance,
  pendingDates,
  reconcileTable,
  type ReconcileTable,
  redactSecrets,
  zonedDayStart,
} from "./reconcile-core.ts";

const metaTable: ReconcileTable = {
  id: "t-meta",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "facebook_insights",
  integration_settings: { ad_account_id: "act_1" },
};
const googleTable: ReconcileTable = {
  id: "t-google",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "google_ads",
  integration_settings: { customer_id: "123-456-7890" },
};

const row = (
  campaign_id: string,
  date: string,
  data: Record<string, unknown>,
): CampaignDayRow => ({
  campaign_id,
  campaign_name: (data.campaign_name as string) || `C${campaign_id}`,
  date,
  data: { campaign_id, date, ...data },
});

Deno.test("tolerance: money floor of 20 and 2% of the platform value", () => {
  // Below 1,000 the floor of 20 wins; exactly at the threshold is not a mismatch.
  assertFalse(exceedsTolerance(1020, 1000, "money"));
  assert(exceedsTolerance(1020.01, 1000, "money"));
  assertFalse(exceedsTolerance(5, 0, "money"));
  assertFalse(exceedsTolerance(0, 20, "money"));
  assert(exceedsTolerance(0, 20.01, "money"));
  // Above 1,000 the 2% wins: 2% of 5,000 is 100.
  assertFalse(exceedsTolerance(4900, 5000, "money"));
  assert(exceedsTolerance(4899.99, 5000, "money"));
});

Deno.test("tolerance: result counts allow one off, then 2%", () => {
  assertFalse(exceedsTolerance(9, 10, "count"));
  assert(exceedsTolerance(8, 10, "count"));
  assertFalse(exceedsTolerance(98, 100, "count"));
  assert(exceedsTolerance(97, 100, "count"));
  // Floating noise does not create a mismatch at the boundary.
  assertFalse(exceedsTolerance(0.1 + 0.2 + 19.7, 0, "money"));
});

Deno.test(
  "window: 7 complete days ending yesterday in the account's time zone",
  () => {
    // 22:30 UTC on Oct 25 is already Oct 26 in Israel but still Oct 25 in LA.
    const now = new Date("2026-10-25T22:30:00Z");
    const il = completeDaysWindow(now, "Asia/Jerusalem");
    assertEquals(
      [il.start, il.end, il.today],
      ["2026-10-19", "2026-10-25", "2026-10-26"],
    );
    assertStrictEquals(il.dates.length, 7);
    const la = completeDaysWindow(now, "America/Los_Angeles");
    assertEquals([la.start, la.end], ["2026-10-18", "2026-10-24"]);
    const utc = completeDaysWindow(now, "UTC");
    assertEquals([utc.start, utc.end], ["2026-10-18", "2026-10-24"]);
  },
);

Deno.test("window: an unknown time zone falls back to UTC and says so", () => {
  const w = completeDaysWindow(new Date("2026-10-26T01:30:00Z"), "Mars/Base");
  assertStrictEquals(w.timezone, "UTC");
  assertStrictEquals(w.timezone_fallback, true);
  assertStrictEquals(w.end, "2026-10-25");
});

Deno.test("zoned midnight across DST changes", () => {
  // Israel leaves DST on 2026-10-25 at 02:00, so that day starts at +03:00.
  assertStrictEquals(
    zonedDayStart("2026-10-25", "Asia/Jerusalem").toISOString(),
    "2026-10-24T21:00:00.000Z",
  );
  assertStrictEquals(
    zonedDayStart("2026-10-26", "Asia/Jerusalem").toISOString(),
    "2026-10-25T22:00:00.000Z",
  );
  // New York enters DST at 02:00 on 2026-03-08; midnight is still -05:00.
  assertStrictEquals(
    zonedDayStart("2026-03-08", "America/New_York").toISOString(),
    "2026-03-08T05:00:00.000Z",
  );
  assertStrictEquals(
    zonedDayStart("2026-03-09", "America/New_York").toISOString(),
    "2026-03-09T04:00:00.000Z",
  );
});

Deno.test("pending: yesterday waits for a sync that ran after it ended", () => {
  const now = new Date("2026-10-26T01:30:00Z");
  const w = completeDaysWindow(now, "Asia/Jerusalem");
  // Oct 25 ends at 22:00 UTC in Israel. The afternoon sync at 11:45 UTC is before that.
  assertEquals(pendingDates(w, "2026-10-25T11:45:00Z"), ["2026-10-25"]);
  assertEquals(pendingDates(w, "2026-10-25T22:00:00Z"), []);
  // Never synced: compare everything (the gap shows as missing days).
  assertEquals(pendingDates(w, null), []);
  // A New York account's yesterday (Oct 24) ended at 04:00 UTC on Oct 25.
  const ny = completeDaysWindow(now, "America/New_York");
  assertStrictEquals(ny.end, "2026-10-24");
  assertEquals(pendingDates(ny, "2026-10-25T11:45:00Z"), []);
});

Deno.test(
  "compare: rows without entity_level are campaign rows; adset rows are ignored",
  () => {
    const dates = ["2026-10-20"];
    const r = compareCampaignDays({
      table: metaTable,
      platform: "meta",
      dates,
      platformRows: [
        row("1", "2026-10-20", {
          spend: 100,
          leads: 4,
          campaign_objective: "OUTCOME_LEADS",
        }),
      ],
      aiosRows: [
        // Legacy row: no entity_level.
        row("1", "2026-10-20", { spend: 100, leads: 4 }),
        // Ad-set row of the same campaign would double count.
        row("1", "2026-10-20", { spend: 100, leads: 4, entity_level: "adset" }),
      ],
    });
    assertEquals(r.findings, []);
    assertEquals(r.campaigns, { aios: 1, platform: 1, both: 1 });
  },
);

Deno.test("compare: spend, results and revenue per campaign per day", () => {
  const dates = ["2026-10-20", "2026-10-21"];
  const r = compareCampaignDays({
    table: { ...metaTable, integration_type: "facebook_ecommerce" },
    platform: "meta",
    dates,
    platformRows: [
      row("1", "2026-10-20", {
        spend: 500,
        purchases: 10,
        purchase_value: 4000,
        campaign_objective: "OUTCOME_SALES",
      }),
      row("1", "2026-10-21", {
        spend: 500,
        purchases: 10,
        purchase_value: 4000,
        campaign_objective: "OUTCOME_SALES",
      }),
    ],
    aiosRows: [
      row("1", "2026-10-20", {
        spend: 500,
        purchases: 10,
        purchase_value: 4000,
      }),
      // Day 2: spend short by 30 (> 20), two purchases missing, revenue short by 200 (> 80).
      row("1", "2026-10-21", {
        spend: 470,
        purchases: 8,
        purchase_value: 3800,
      }),
    ],
  });
  assertEquals(
    r.findings.map((f) => [
      f.kind,
      f.date,
      f.metric,
      f.aios_value,
      f.platform_value,
    ]),
    [
      ["mismatch", "2026-10-21", "revenue", 3800, 4000],
      ["mismatch", "2026-10-21", "spend", 470, 500],
      ["mismatch", "2026-10-21", "purchases", 8, 10],
    ],
  );
  assertStrictEquals(r.counts.mismatch, 3);
});

Deno.test("compare: missing day, missing campaign on each side", () => {
  const dates = ["2026-10-20", "2026-10-21"];
  const r = compareCampaignDays({
    table: metaTable,
    platform: "meta",
    dates,
    platformRows: [
      row("1", "2026-10-20", { spend: 100, leads: 2 }),
      row("1", "2026-10-21", { spend: 300, leads: 5 }),
      row("2", "2026-10-20", { spend: 80, leads: 1 }),
    ],
    aiosRows: [
      // Oct 21 has no rows at all in AIOS.
      row("1", "2026-10-20", { spend: 100, leads: 2 }),
      // A campaign Meta does not know (e.g. copied from another account).
      row("9", "2026-10-20", { spend: 55, leads: 1 }),
    ],
  });
  assertEquals(
    r.findings.map((f) => [
      f.kind,
      f.campaign_id,
      f.date,
      f.aios_value,
      f.platform_value,
    ]),
    [
      ["missing_day", null, "2026-10-21", 0, 300],
      ["missing_in_aios", "2", null, 0, 80],
      ["missing_on_platform", "9", null, 55, 0],
    ],
  );
  assertEquals(r.missing_dates, ["2026-10-21"]);
});

Deno.test("compare: legacy rows with only a name match the platform id", () => {
  const r = compareCampaignDays({
    table: metaTable,
    platform: "meta",
    dates: ["2026-10-20"],
    platformRows: [
      row("1", "2026-10-20", { spend: 100, campaign_name: "קיץ | לידים" }),
    ],
    aiosRows: [
      {
        campaign_id: "",
        campaign_name: "קיץ | לידים",
        date: "2026-10-20",
        data: { campaign_name: "קיץ | לידים", date: "2026-10-20", spend: 100 },
      },
    ],
  });
  assertEquals(r.findings, []);
});

Deno.test(
  "compare: Google uses cost, conversions and conversions_value",
  () => {
    const r = compareCampaignDays({
      table: googleTable,
      platform: "google",
      dates: ["2026-10-20"],
      platformRows: [
        row("55", "2026-10-20", {
          cost: 210.5,
          conversions: 7.5,
          conversions_value: 0,
        }),
      ],
      aiosRows: [
        row("55", "2026-10-20", {
          cost: 210.5,
          conversions: 5,
          conversions_value: 0,
        }),
      ],
    });
    assertEquals(
      r.findings.map((f) => [f.metric, f.aios_value, f.platform_value]),
      [["conversions", 5, 7.5]],
    );
  },
);

Deno.test(
  "redaction removes tokens from URLs, bearer headers and bare tokens",
  () => {
    const out = redactSecrets(
      "error sending request for url (https://graph.facebook.com/v21.0/act_1/insights?access_token=EAAB1234567890abcdefghijklmnop&limit=500): Bearer ya29.a0AfH6SMB and EAAG99999999999999999999999",
    );
    assertFalse(out.includes("EAAB1234567890"));
    assertFalse(out.includes("ya29.a0"));
    assertFalse(out.includes("EAAG9999"));
    assert(out.includes("graph.facebook.com/v21.0/act_1/insights?[redacted]"));
  },
);

Deno.test("fixture source exists only outside production", () => {
  assertThrows(() => createFixtureSource({}, undefined));
  assertThrows(() => createFixtureSource({}, "production"));
  createFixtureSource({}, "staging");
  createFixtureSource({}, "development");
});

const now = new Date("2026-10-26T01:30:00Z");

Deno.test(
  "reconcileTable: matching data is ok and reports totals",
  async () => {
    const rows = [row("1", "2026-10-20", { spend: 100, leads: 3 })];
    const source = createFixtureSource(
      {
        "t-meta": {
          account: {
            account_id: "act_1",
            timezone: "Asia/Jerusalem",
            currency: "ILS",
          },
          rows,
        },
      },
      "staging",
    );
    const r = await reconcileTable({
      table: { ...metaTable, last_sync_at: "2026-10-25T11:45:00Z" },
      source,
      readAios: () => Promise.resolve(rows),
      now,
    });
    assertStrictEquals(r.status, "ok");
    // The run's window is what was compared; the held-back day is listed apart.
    assertEquals([r.window_start, r.window_end], ["2026-10-19", "2026-10-24"]);
    assertEquals(r.summary.requested_window, {
      start: "2026-10-19",
      end: "2026-10-25",
    });
    assertEquals(r.summary.pending_dates, ["2026-10-25"]);
    assertStrictEquals(r.summary.compared_dates, 6);
    assertStrictEquals(r.summary.currency, "ILS");
  },
);

Deno.test(
  "reconcileTable: when every day still waits for a sync, nothing is called a match",
  async () => {
    // "Check yesterday's report against Meta" at 01:30 UTC, before the morning
    // sync: the last sync (11:45 UTC on the 26th) ran before the 26th ended.
    let platformReads = 0;
    let aiosReads = 0;
    const source = createFixtureSource(
      {
        "t-meta": {
          account: {
            account_id: "act_1",
            timezone: "Asia/Jerusalem",
            currency: "ILS",
          },
          rows: [],
        },
      },
      "staging",
    );
    const r = await reconcileTable({
      table: { ...metaTable, last_sync_at: "2026-10-26T11:45:00Z" },
      source: {
        ...source,
        campaignDays: (...args) => {
          platformReads += 1;
          return source.campaignDays(...args);
        },
      },
      readAios: () => {
        aiosReads += 1;
        return Promise.resolve([]);
      },
      now: new Date("2026-10-27T01:30:00Z"),
      days: 1,
    });
    assertStrictEquals(r.status, "skipped");
    assertStrictEquals(r.summary.skipped_reason, "not_yet_synced");
    assertEquals(r.summary.pending_dates, ["2026-10-26"]);
    assertStrictEquals(r.summary.compared_dates, 0);
    assertEquals([r.window_start, r.window_end], [null, null]);
    assertEquals([platformReads, aiosReads], [0, 0]);
  },
);

Deno.test(
  "reconcileTable: a token error fails the run with a redacted error and no findings",
  async () => {
    const source = createFixtureSource(
      {
        "t-meta": {
          account: { account_id: "act_1", timezone: "UTC", currency: "ILS" },
          rows: [],
          error: {
            kind: "auth",
            message:
              "Meta 400: Error validating access token: https://graph.facebook.com/v21.0/act_1?access_token=EAABsecretsecretsecretsecret",
          },
        },
      },
      "staging",
    );
    let aiosReads = 0;
    const r = await reconcileTable({
      table: metaTable,
      source,
      readAios: () => {
        aiosReads += 1;
        return Promise.resolve([]);
      },
      now,
    });
    assertStrictEquals(r.status, "failed");
    assertStrictEquals(r.error_kind, "auth");
    assertEquals(r.findings, []);
    assertStrictEquals(aiosReads, 0);
    assertFalse(String(r.summary.error).includes("EAABsecret"));
  },
);

Deno.test(
  "reconcileTable: findings are capped; the summary keeps the full count",
  async () => {
    const platformRows: CampaignDayRow[] = [];
    for (let i = 0; i < 150; i++)
      platformRows.push(row(String(i), "2026-10-20", { spend: 1000 }));
    const aiosRows = platformRows.map((r) => ({
      ...r,
      data: { ...r.data, spend: 500 },
    }));
    const source = createFixtureSource(
      {
        "t-meta": {
          account: { account_id: "act_1", timezone: "UTC", currency: "USD" },
          rows: platformRows,
        },
      },
      "staging",
    );
    const r = await reconcileTable({
      table: metaTable,
      source,
      readAios: () => Promise.resolve(aiosRows),
      now,
    });
    assertStrictEquals(r.status, "mismatch");
    assertStrictEquals(r.findings.length, 100);
    assertStrictEquals(r.summary.findings_total, 150);
    assertStrictEquals(r.summary.truncated, true);
  },
);

Deno.test(
  "reconcileTable: a table without an account is skipped, not failed",
  async () => {
    const source = createFixtureSource(
      {
        "t-meta": {
          account: { account_id: "", timezone: "UTC", currency: null },
          rows: [],
          error: { kind: "config", message: "no ad account on the table" },
        },
      },
      "staging",
    );
    const r = await reconcileTable({
      table: metaTable,
      source,
      readAios: () => Promise.resolve([]),
      now,
    });
    assertStrictEquals(r.status, "skipped");
    assertStrictEquals(r.summary.skipped_reason, "no ad account on the table");
  },
);
