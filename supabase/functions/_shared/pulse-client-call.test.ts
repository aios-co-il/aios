import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

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

Deno.test(
  "14-day rule: missing or old call is flagged, recent call is not, unknown stays null",
  () => {
    assertStrictEquals(CLIENT_CALL_STALE_MS, 14 * 24 * 60 * 60 * 1000);
    assertStrictEquals(resolveNoRecentClientCall(null, NOW), true);
    assertStrictEquals(resolveNoRecentClientCall("", NOW), true);
    assertStrictEquals(resolveNoRecentClientCall("not a date", NOW), true);
    assertStrictEquals(resolveNoRecentClientCall(OLD, NOW), true);
    assertStrictEquals(resolveNoRecentClientCall(RECENT, NOW), false);
    assertStrictEquals(resolveNoRecentClientCall(undefined, NOW), null);
    assertStrictEquals(
      NO_RECENT_CLIENT_CALL_TEXT,
      "ללא שיחה מתועדת ב-14 הימים האחרונים",
    );
  },
);

Deno.test("legacy call flags are recognized and other flags are not", () => {
  assertStrictEquals(
    isLegacyClientCallFlag("לא תועדה שיחה טלפונית עם הלקוח"),
    true,
  );
  assertStrictEquals(isLegacyClientCallFlag(LEGACY_FLAG), true);
  assertStrictEquals(isLegacyClientCallFlag("CPL עלה ב-40%"), false);
  assertStrictEquals(isLegacyClientCallFlag("סנכרון ישן או חסר: Meta"), false);
  assertStrictEquals(isLegacyClientCallFlag(null), false);
});

Deno.test(
  "row indicator prefers the explicit field, then legacy flag text",
  () => {
    assertStrictEquals(
      pulseRowHasNoRecentClientCall({ no_recent_client_call: true }),
      true,
    );
    assertStrictEquals(
      pulseRowHasNoRecentClientCall({
        no_recent_client_call: false,
        flags: [LEGACY_FLAG],
      }),
      false,
    );
    assertStrictEquals(
      pulseRowHasNoRecentClientCall({ flags: [LEGACY_FLAG] }),
      true,
    );
    assertStrictEquals(
      pulseRowHasNoRecentClientCall({ no_recent_client_call: null, flags: [] }),
      false,
    );
  },
);

Deno.test(
  "current rows: healthy client with no call stays healthy and gains the indicator",
  () => {
    const row = normalizePulseRowClientCall(
      {
        status: "healthy",
        lead_goal_status: "healthy",
        flags: [],
        last_client_call_at: null,
      },
      NOW,
    );
    assertStrictEquals(row.status, "healthy");
    assertStrictEquals(row.lead_goal_status, "healthy");
    assertEquals(row.flags, []);
    assertStrictEquals(row.no_recent_client_call, true);

    const recent = normalizePulseRowClientCall(
      {
        status: "warning",
        flags: ["CPL עלה ב-40%"],
        last_client_call_at: RECENT,
      },
      NOW,
    );
    assertStrictEquals(recent.status, "warning");
    assertStrictEquals(recent.no_recent_client_call, false);
  },
);

Deno.test(
  "call columns not loaded: indicator is unknown, not a claimed gap",
  () => {
    const row = normalizePulseRowClientCall(
      { status: "healthy", flags: [] },
      NOW,
    );
    assertStrictEquals(row.no_recent_client_call, null);
  },
);

Deno.test(
  "legacy rows: a warning caused only by the call flag goes back to healthy",
  () => {
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
    assertStrictEquals(row.status, "healthy");
    assertStrictEquals(row.lead_goal_status, "healthy");
    assertStrictEquals(row.ecommerce_goal_status, null);
    assertEquals(row.flags, []);
    assertStrictEquals(row.no_recent_client_call, true);
  },
);

Deno.test(
  "legacy rows: real performance or data issues keep their status",
  () => {
    const perf = normalizePulseRowClientCall(
      {
        status: "warning",
        flags: ["CPL עלה ב-40%", LEGACY_FLAG],
        last_client_call_at: null,
      },
      NOW,
    );
    assertStrictEquals(perf.status, "warning");
    assertEquals(perf.flags, ["CPL עלה ב-40%"]);
    assertStrictEquals(perf.no_recent_client_call, true);

    const critical = normalizePulseRowClientCall(
      {
        status: "critical",
        flags: ["חנות: הוצאה בלי רכישות", LEGACY_FLAG],
      },
      NOW,
    );
    assertStrictEquals(critical.status, "critical");
    assertStrictEquals(critical.no_recent_client_call, true);

    const noData = normalizePulseRowClientCall(
      { status: "no_data", flags: ["אין טבלת קמפיין מחוברת", LEGACY_FLAG] },
      NOW,
    );
    assertStrictEquals(noData.status, "no_data");
  },
);
