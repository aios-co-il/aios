import {
  assertEquals,
  assertFalse,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { createFixtureSource } from "../../carmen-reconcile-worker/fixture-source.ts";
import { reconcileTable } from "./reconcile-table.ts";
import { metaTable, row } from "./test-fixtures.ts";
import type { CampaignDayRow } from "./types.ts";

const now = new Date("2026-10-26T01:30:00Z");

describe("reconcileTable", () => {
  it("calls matching data ok and reports totals", async () => {
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
  });

  it("calls nothing a match when every day still waits for a sync", async () => {
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
  });

  it("fails the run on a token error with a redacted error and no findings", async () => {
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
  });

  it("caps the findings and keeps the full count in the summary", async () => {
    const platformRows: CampaignDayRow[] = [];
    for (let i = 0; i < 150; i++) {
      platformRows.push(row(String(i), "2026-10-20", { spend: 1000 }));
    }
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
  });

  it("skips a table without an account instead of failing it", async () => {
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
  });
});
