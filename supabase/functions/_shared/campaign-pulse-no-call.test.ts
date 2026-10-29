import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import {
  buildPulseWhatsAppDigest,
  classifyCampaignPulseStatus,
  clientPerformance,
} from "./campaign-pulse.ts";
import { resolveNoRecentClientCall } from "./pulse/client-call.ts";

// AIO-227: "no call logged" is its own indicator and never colors campaign health.

const NOW = Date.parse("2026-10-26T09:00:00.000Z");
const FRESH_SYNC = "2026-10-26T06:00:00.000Z";
const OLD_CALL = "2026-09-20T09:00:00.000Z";
const RECENT_CALL = "2026-10-20T09:00:00.000Z";
const DASHBOARD = "https://aios.co.il/t/dmm/dmm-dashboard";

function classifyHealthyLeads(integrationType = "facebook_insights") {
  return classifyCampaignPulseStatus({
    activeTables: [
      {
        integration_type: integrationType,
        campaign_active: true,
        last_sync_at: FRESH_SYNC,
        integration_settings: {},
      },
    ],
    hasConfiguredCampaignTable: true,
    recentRecordCount: 20,
    isEcommerce: false,
    spend7: 900,
    leads7: 12,
    purchases7: 0,
    roas: null,
    cplChangePct: 3,
    nowMs: NOW,
  });
}

Deno.test(
  "good performance and no logged call: healthy status, flagged no-call",
  () => {
    const classification = classifyHealthyLeads();
    assertStrictEquals(classification.status, "healthy");
    assertEquals(classification.flags, []);

    const performance = clientPerformance({
      client_name: "בילבי",
      status: classification.status,
      flags: classification.flags,
      no_recent_client_call: true,
    });
    assertStrictEquals(performance.status, "healthy");
    assertStrictEquals(performance.ops, false);
    assertStrictEquals(performance.noRecentCall, true);
  },
);

Deno.test(
  "client without a documented call in 14 days stays healthy (call is a separate indicator)",
  () => {
    const result = classifyHealthyLeads();
    assertStrictEquals(result.status, "healthy");
    assertEquals(result.flags, []);
    assertStrictEquals(resolveNoRecentClientCall(OLD_CALL, NOW), true);
  },
);

Deno.test("client call within 14 days keeps healthy campaign healthy", () => {
  const result = classifyHealthyLeads();
  assertStrictEquals(result.status, "healthy");
  assertEquals(result.flags, []);
  assertStrictEquals(resolveNoRecentClientCall(RECENT_CALL, NOW), false);
});

Deno.test("client with no documented call keeps its performance status", () => {
  const result = classifyHealthyLeads("google_ads");
  assertStrictEquals(result.status, "healthy");
  assertEquals(result.flags, []);
  assertStrictEquals(resolveNoRecentClientCall(null, NOW), true);
});

Deno.test(
  "multi-client digest counts no-call separately from the status counts",
  () => {
    const digest = buildPulseWhatsAppDigest(
      [
        {
          client_name: "א",
          status: "critical",
          flags: ["הוצאה ללא לידים"],
          no_recent_client_call: true,
        },
        {
          client_name: "ב",
          status: "warning",
          flags: ["CPL עלה ב-40%"],
          no_recent_client_call: false,
        },
        {
          client_name: "ג",
          status: "healthy",
          flags: [],
          no_recent_client_call: true,
        },
        {
          client_name: "ד",
          status: "healthy",
          flags: [],
          no_recent_client_call: false,
        },
        {
          client_name: "ה",
          status: "no_data",
          flags: ["אין טבלת קמפיין מחוברת"],
          no_recent_client_call: true,
        },
        // Call data unavailable: no claim either way.
        {
          client_name: "ו",
          status: "healthy",
          flags: [],
          no_recent_client_call: null,
        },
      ],
      DASHBOARD,
    );
    assertMatch(digest, /🔴 \*1\* דורשים טיפול/);
    assertMatch(digest, /🟡 \*1\* במגמה שלילית/);
    assertMatch(digest, /🟢 \*3\* תקינים/);
    assertMatch(
      digest,
      /⚙️ \*1\* עם בעיית תפעול \(בלי טבלה מחוברת \/ סנכרון ישן\)/,
    );
    assertMatch(digest, /📞 \*3\* ללא שיחה מתועדת ב-14 הימים האחרונים/);
    // The ops line no longer mixes in the call gap, and the healthy client with
    // no call is not listed among the warnings.
    assertNotMatch(digest, /בלי שיחה/);
    assertNotMatch(digest, /🟡 [^*]*ג/);
    const lines = digest.split("\n");
    const callIndex = lines.findIndex((line) => line.startsWith("📞"));
    assertStrictEquals(lines[callIndex - 1], "");
  },
);

Deno.test("no call line when every client has a recent call", () => {
  const digest = buildPulseWhatsAppDigest(
    [
      { client_name: "א", status: "healthy", no_recent_client_call: false },
      { client_name: "ב", status: "healthy", no_recent_client_call: false },
    ],
    DASHBOARD,
  );
  assertNotMatch(digest, /📞/);
  assertMatch(digest, /🟢 \*2\* תקינים/);
});

Deno.test(
  "single-client digest keeps healthy status and adds a separate call line",
  () => {
    const digest = buildPulseWhatsAppDigest(
      [
        {
          client_name: "בילבי",
          status: "healthy",
          campaign_goal_mode: "leads",
          leads_7d: 12,
          cpl_7d: 75,
          flags: [],
          no_recent_client_call: true,
        },
      ],
      DASHBOARD,
    );
    assertMatch(digest, /סטטוס: 🟢 תקין/);
    assertMatch(digest, /📞 ללא שיחה מתועדת ב-14 הימים האחרונים/);
  },
);

Deno.test(
  "legacy snapshot with only the call flag reads as healthy plus no-call",
  () => {
    const digest = buildPulseWhatsAppDigest(
      [
        {
          client_name: "Detailit",
          status: "warning",
          flags: ["לא תועדה שיחה טלפונית עם הלקוח"],
        },
        { client_name: "בילבי", status: "healthy", flags: [] },
      ],
      DASHBOARD,
    );
    assertMatch(digest, /🟡 \*0\* במגמה שלילית/);
    assertMatch(digest, /🟢 \*2\* תקינים/);
    assertMatch(digest, /📞 \*1\* ללא שיחה מתועדת/);
    assertNotMatch(digest, /⚙️/);
  },
);
