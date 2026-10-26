import assert from "node:assert/strict";
import test from "node:test";

import {
  CLIENT_CALL_STALE_MS,
  NO_RECENT_CLIENT_CALL_TEXT,
  isLegacyClientCallFlag,
  normalizePulseRowClientCall,
  pulseRowHasNoRecentClientCall,
  resolveNoRecentClientCall,
} from "./pulse-client-call.ts";

const NOW = Date.parse("2026-10-26T09:00:00.000Z");
const RECENT = "2026-10-20T09:00:00.000Z";
const OLD = "2026-10-01T09:00:00.000Z";
const LEGACY_FLAG = "לא תועדה שיחה טלפונית עם הלקוח ב-14 הימים האחרונים";

test("14-day rule: missing or old call is flagged, recent call is not, unknown stays null", () => {
  assert.equal(CLIENT_CALL_STALE_MS, 14 * 24 * 60 * 60 * 1000);
  assert.equal(resolveNoRecentClientCall(null, NOW), true);
  assert.equal(resolveNoRecentClientCall("", NOW), true);
  assert.equal(resolveNoRecentClientCall("not a date", NOW), true);
  assert.equal(resolveNoRecentClientCall(OLD, NOW), true);
  assert.equal(resolveNoRecentClientCall(RECENT, NOW), false);
  assert.equal(resolveNoRecentClientCall(undefined, NOW), null);
  assert.equal(
    NO_RECENT_CLIENT_CALL_TEXT,
    "ללא שיחה מתועדת ב-14 הימים האחרונים",
  );
});

test("legacy call flags are recognized and other flags are not", () => {
  assert.equal(isLegacyClientCallFlag("לא תועדה שיחה טלפונית עם הלקוח"), true);
  assert.equal(isLegacyClientCallFlag(LEGACY_FLAG), true);
  assert.equal(isLegacyClientCallFlag("CPL עלה ב-40%"), false);
  assert.equal(isLegacyClientCallFlag("סנכרון ישן או חסר: Meta"), false);
  assert.equal(isLegacyClientCallFlag(null), false);
});

test("row indicator prefers the explicit field, then legacy flag text", () => {
  assert.equal(
    pulseRowHasNoRecentClientCall({ no_recent_client_call: true }),
    true,
  );
  assert.equal(
    pulseRowHasNoRecentClientCall({
      no_recent_client_call: false,
      flags: [LEGACY_FLAG],
    }),
    false,
  );
  assert.equal(pulseRowHasNoRecentClientCall({ flags: [LEGACY_FLAG] }), true);
  assert.equal(
    pulseRowHasNoRecentClientCall({ no_recent_client_call: null, flags: [] }),
    false,
  );
});

test("current rows: healthy client with no call stays healthy and gains the indicator", () => {
  const row = normalizePulseRowClientCall(
    {
      status: "healthy",
      lead_goal_status: "healthy",
      flags: [],
      last_client_call_at: null,
    },
    NOW,
  );
  assert.equal(row.status, "healthy");
  assert.equal(row.lead_goal_status, "healthy");
  assert.deepEqual(row.flags, []);
  assert.equal(row.no_recent_client_call, true);

  const recent = normalizePulseRowClientCall(
    {
      status: "warning",
      flags: ["CPL עלה ב-40%"],
      last_client_call_at: RECENT,
    },
    NOW,
  );
  assert.equal(recent.status, "warning");
  assert.equal(recent.no_recent_client_call, false);
});

test("call columns not loaded: indicator is unknown, not a claimed gap", () => {
  const row = normalizePulseRowClientCall(
    { status: "healthy", flags: [] },
    NOW,
  );
  assert.equal(row.no_recent_client_call, null);
});

test("legacy rows: a warning caused only by the call flag goes back to healthy", () => {
  const row = normalizePulseRowClientCall(
    {
      status: "warning",
      lead_goal_status: "warning",
      ecommerce_goal_status: null,
      flags: [LEGACY_FLAG],
      last_client_call_at: OLD,
    },
    NOW,
  );
  assert.equal(row.status, "healthy");
  assert.equal(row.lead_goal_status, "healthy");
  assert.equal(row.ecommerce_goal_status, null);
  assert.deepEqual(row.flags, []);
  assert.equal(row.no_recent_client_call, true);
});

test("legacy rows: real performance or data issues keep their status", () => {
  const perf = normalizePulseRowClientCall(
    {
      status: "warning",
      flags: ["CPL עלה ב-40%", LEGACY_FLAG],
      last_client_call_at: null,
    },
    NOW,
  );
  assert.equal(perf.status, "warning");
  assert.deepEqual(perf.flags, ["CPL עלה ב-40%"]);
  assert.equal(perf.no_recent_client_call, true);

  const critical = normalizePulseRowClientCall(
    {
      status: "critical",
      flags: ["חנות: הוצאה בלי רכישות", LEGACY_FLAG],
    },
    NOW,
  );
  assert.equal(critical.status, "critical");
  assert.equal(critical.no_recent_client_call, true);

  const noData = normalizePulseRowClientCall(
    { status: "no_data", flags: ["אין טבלת קמפיין מחוברת", LEGACY_FLAG] },
    NOW,
  );
  assert.equal(noData.status, "no_data");
});
