import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { CallBudget } from "./budget.ts";
import { ReconcileSourceError } from "./errors.ts";
import {
  metaRecording,
  recordedMetaTable as metaTable,
  TOKEN,
} from "./meta-recordings.ts";
import { createMetaSource } from "./meta-source.ts";
import { reconcileTable } from "./reconcile-table.ts";
import { replay, sleepRecorder } from "./test-fixtures.ts";
import type { CampaignDayRow } from "./types.ts";

const { sleep } = sleepRecorder();

/** A Meta source over recorded responses, with the recorded token. */
const recordedSource = (fetchFn: ReturnType<typeof replay>["fetchFn"]) =>
  createMetaSource({
    getToken: () => Promise.resolve(TOKEN),
    budget: new CallBudget(50),
    fetch: fetchFn,
    sleep,
  });

describe("createMetaSource", () => {
  it("follows paging, asks for daily campaign rows and counts results like the sync", async () => {
    const rec = metaRecording();
    const budget = new CallBudget(50);
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget,
      fetch: rec.fetchFn,
      sleep,
    });
    const account = await source.account(metaTable);
    assertEquals(account, {
      account_id: "act_1234",
      name: "Client Ads",
      currency: "ILS",
      timezone: "Asia/Jerusalem",
    });
    const { rows } = await source.campaignDays(
      metaTable,
      { start: "2026-10-19", end: "2026-10-25" },
      account,
    );
    assertStrictEquals(rec.left(), 0);
    assertStrictEquals(budget.used, 6);
    const insightsCall = rec.calls.find((c) => /\/insights\?level/.test(c.url));
    assert(insightsCall);
    const params = new URL(insightsCall.url).searchParams;
    assertStrictEquals(params.get("time_increment"), "1");
    assertStrictEquals(params.get("level"), "campaign");
    assertEquals(JSON.parse(params.get("time_range") || "null"), {
      since: "2026-10-19",
      until: "2026-10-25",
    });
    const byId = Object.fromEntries(rows.map((r) => [r.campaign_id, r.data]));
    // The ad set's custom event is authoritative: 4 leads, not the broad 9.
    assertStrictEquals(byId["111"].leads, 4);
    assertStrictEquals(byId["111"].spend, 120.5);
    assertStrictEquals(byId["222"].purchases, 3);
    assertStrictEquals(byId["222"].purchase_value, 900);
  });

  it("treats no token as an auth failure", async () => {
    const source = createMetaSource({
      getToken: () => Promise.resolve(null),
      budget: new CallBudget(5),
      fetch: () => Promise.reject(new Error("must not call")),
    });
    const err = await assertRejects(
      () => source.account(metaTable),
      ReconcileSourceError,
    );
    assertStrictEquals(err.kind, "auth");
  });
});

describe("reconcileTable with the Meta source", () => {
  it("falls back to UTC for an account without a time zone and says so", async () => {
    const rec = replay([
      {
        match: /\/act_1234\?/,
        body: { account_id: "1234", name: "No zone", currency: "ILS" },
      },
      { match: /\/campaigns\?/, body: { data: [] } },
      { match: /\/adsets\?/, body: { data: [] } },
      { match: /\/insights\?/, body: { data: [] } },
    ]);
    const r = await reconcileTable({
      table: { ...metaTable, last_sync_at: null },
      source: recordedSource(rec.fetchFn),
      readAios: () => Promise.resolve([]),
      now: new Date("2026-10-26T01:30:00Z"),
    });
    assertStrictEquals(r.summary.timezone, "UTC");
    assertStrictEquals(r.summary.timezone_fallback, true);
  });

  it("fails the run on a token error with a redacted error and stores no findings", async () => {
    const rec = replay([
      {
        match: /\/act_1234\?/,
        status: 400,
        body: {
          error: {
            code: 190,
            type: "OAuthException",
            message: `Error validating access token: Session has expired. url=https://graph.facebook.com/v21.0/act_1234?access_token=${TOKEN}`,
          },
        },
      },
    ]);
    const result = await reconcileTable({
      table: metaTable,
      source: recordedSource(rec.fetchFn),
      readAios: () => Promise.resolve([]),
      now: new Date("2026-10-26T01:30:00Z"),
    });
    assertStrictEquals(result.status, "failed");
    assertStrictEquals(result.error_kind, "auth");
    assertEquals(result.findings, []);
    assertFalse(JSON.stringify(result.summary).includes(TOKEN));
    assert(String(result.summary.error).includes("Session has expired"));
  });

  it("compares recorded rows with stored rows over the account-time-zone window", async () => {
    const rec = metaRecording();
    const stored: CampaignDayRow[] = [
      {
        campaign_id: "111",
        campaign_name: "לידים | אתר",
        date: "2026-10-19",
        // Legacy row: no entity_level, one lead missing → within tolerance.
        data: {
          date: "2026-10-19",
          campaign_id: "111",
          spend: 120.5,
          leads: 3,
        },
      },
    ];
    // 01:30 UTC on Oct 26 is already Oct 26 in Israel; the sync ran after Oct 25 ended.
    const result = await reconcileTable({
      table: metaTable,
      source: recordedSource(rec.fetchFn),
      readAios: (_t, start, end) => {
        assertEquals([start, end], ["2026-10-19", "2026-10-25"]);
        return Promise.resolve(stored);
      },
      now: new Date("2026-10-26T01:30:00Z"),
    });
    assertStrictEquals(result.status, "mismatch");
    assertEquals(
      result.findings.map((f) => [f.kind, f.date, f.platform_value]),
      [["missing_day", "2026-10-25", 300]],
    );
  });
});
