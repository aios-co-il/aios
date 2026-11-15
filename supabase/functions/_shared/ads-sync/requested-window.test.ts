import { assertEquals } from "jsr:@std/assert@1";

import { isRecord } from "./is-record.ts";
import {
  MAX_REQUESTED_WINDOW_DAYS,
  parseRequestedWindow,
  resolveManualSyncWindow,
} from "./requested-window.ts";
import { fakeClient } from "./tests/fake-postgrest.ts";
import { storedTable } from "./tests/meta-graph-fixtures.ts";
import { syncAdsWindow } from "./write-window.ts";

const TODAY = "2026-11-15";
const USER = { today: TODAY, enforceLimits: true };
// 2026-11-15 10:00 in Israel.
const NOW = new Date("2026-11-15T08:00:00Z");
const CONFIGURED = { startDate: "2026-11-08", endDate: "2026-11-15" };

Deno.test("parseRequestedWindow: no dates means no window", () => {
  assertEquals(parseRequestedWindow({}, USER), { kind: "none" });
  assertEquals(parseRequestedWindow({ start_date: null, end_date: "" }, USER), {
    kind: "none",
  });
});

Deno.test("parseRequestedWindow: a 7-day window passes as given", () => {
  assertEquals(
    parseRequestedWindow(
      { start_date: "2026-11-08", end_date: "2026-11-14" },
      USER,
    ),
    {
      kind: "window",
      window: { startDate: "2026-11-08", endDate: "2026-11-14" },
    },
  );
});

Deno.test("parseRequestedWindow: rejects malformed or one-sided dates", () => {
  for (const body of [
    { start_date: "2026-11-08" },
    { start_date: "2026-11-8", end_date: "2026-11-14" },
    { start_date: "2026-02-30", end_date: "2026-03-01" },
    { start_date: 20261108, end_date: "2026-11-14" },
  ]) {
    assertEquals(parseRequestedWindow(body, USER).kind, "invalid");
  }
});

Deno.test("parseRequestedWindow: rejects a start after the end", () => {
  assertEquals(
    parseRequestedWindow(
      { start_date: "2026-11-10", end_date: "2026-11-09" },
      USER,
    ).kind,
    "invalid",
  );
});

Deno.test("parseRequestedWindow: today is allowed, tomorrow is not", () => {
  assertEquals(
    parseRequestedWindow({ start_date: TODAY, end_date: TODAY }, USER).kind,
    "window",
  );
  assertEquals(
    parseRequestedWindow({ start_date: TODAY, end_date: "2026-11-16" }, USER)
      .kind,
    "invalid",
  );
});

Deno.test("parseRequestedWindow: 31 days pass, 32 days are rejected", () => {
  assertEquals(MAX_REQUESTED_WINDOW_DAYS, 31);
  assertEquals(
    parseRequestedWindow(
      { start_date: "2026-10-01", end_date: "2026-10-31" },
      USER,
    ).kind,
    "window",
  );
  const tooLong = parseRequestedWindow(
    { start_date: "2026-09-30", end_date: "2026-10-31" },
    USER,
  );
  assertEquals(tooLong.kind, "invalid");
});

Deno.test(
  "parseRequestedWindow: internal callers keep long catch-up windows",
  () => {
    assertEquals(
      parseRequestedWindow(
        { start_date: "2026-07-01", end_date: "2026-11-15" },
        { today: TODAY, enforceLimits: false },
      ).kind,
      "window",
    );
  },
);

Deno.test(
  "resolveManualSyncWindow: an explicit window has no 120-day floor",
  () => {
    assertEquals(
      resolveManualSyncWindow(
        { start_date: "2026-11-08", end_date: "2026-11-14" },
        { configured: CONFIGURED, internal: false, now: NOW },
      ),
      {
        ok: true,
        explicit: true,
        window: { startDate: "2026-11-08", endDate: "2026-11-14" },
      },
    );
  },
);

Deno.test(
  "resolveManualSyncWindow: without a window, old clients keep the legacy pull",
  () => {
    const result = resolveManualSyncWindow(
      {},
      { configured: CONFIGURED, internal: false, now: NOW },
    );
    assertEquals(result.ok && result.explicit, false);
    assertEquals(result.ok && result.window.startDate < "2026-07-20", true);
  },
);

Deno.test("resolveManualSyncWindow: reports a rejected window", () => {
  const result = resolveManualSyncWindow(
    { start_date: "2026-07-01", end_date: "2026-11-14" },
    { configured: CONFIGURED, internal: false, now: NOW },
  );
  assertEquals(result.ok, false);
});

Deno.test("an explicit past window replaces only its own days", async () => {
  // Before, a manual sync always widened to 120+ days through today, so
  // syncing one past day rewrote (and with an empty fetch, kept) every day.
  const db = storedTable();
  const resolved = resolveManualSyncWindow(
    { start_date: "2026-10-24", end_date: "2026-10-24" },
    { configured: CONFIGURED, internal: false, now: NOW },
  );
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }
  const records = [{ date: "2026-10-24", spend: 99 }];
  await syncAdsWindow(
    { deleteClient: fakeClient(db) },
    {
      tableId: "t1",
      tenantId: "tenant-1",
      window: resolved.window,
      records,
      levelCounts: { campaign: 1, adset: 0, ad: 0 },
      source: "test",
    },
  );
  const stored = db.tables.crm_records
    .map((row) =>
      isRecord(row.data) ? `${row.data.date}:${row.data.spend}` : "",
    )
    .sort();
  assertEquals(stored, [
    "2026-06-01:10",
    "2026-10-23:11",
    "2026-10-24:99",
    "2026-10-25:13",
    "2026-10-25:14",
    "2026-10-25:15",
  ]);
});
