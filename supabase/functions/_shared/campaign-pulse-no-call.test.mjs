import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPulseWhatsAppDigest,
  classifyCampaignPulseStatus,
  clientPerformance,
  resolveNoRecentClientCall,
} from "./campaign-pulse.ts";

// AIO-227: "no call logged" is its own indicator and never colors campaign health.

const NOW = Date.parse("2026-10-26T09:00:00.000Z");
const FRESH_SYNC = "2026-10-26T06:00:00.000Z";
const OLD_CALL = "2026-09-20T09:00:00.000Z";
const DASHBOARD = "https://aios.co.il/t/dmm/dmm-dashboard";

test("good performance and no logged call: healthy status, flagged no-call", () => {
  const classification = classifyCampaignPulseStatus({
    activeTables: [
      {
        integration_type: "facebook_insights",
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
  assert.equal(classification.status, "healthy");
  assert.deepEqual(classification.flags, []);
  assert.equal(resolveNoRecentClientCall(null, NOW), true);
  assert.equal(resolveNoRecentClientCall(OLD_CALL, NOW), true);

  const performance = clientPerformance({
    client_name: "בילבי",
    status: classification.status,
    flags: classification.flags,
    no_recent_client_call: true,
  });
  assert.equal(performance.status, "healthy");
  assert.equal(performance.ops, false);
  assert.equal(performance.noRecentCall, true);
});

test("multi-client digest counts no-call separately from the status counts", () => {
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
  assert.match(digest, /🔴 \*1\* דורשים טיפול/);
  assert.match(digest, /🟡 \*1\* במגמה שלילית/);
  assert.match(digest, /🟢 \*3\* תקינים/);
  assert.match(
    digest,
    /⚙️ \*1\* עם בעיית תפעול \(בלי טבלה מחוברת \/ סנכרון ישן\)/,
  );
  assert.match(digest, /📞 \*3\* ללא שיחה מתועדת ב-14 הימים האחרונים/);
  // The ops line no longer mixes in the call gap, and the healthy client with
  // no call is not listed among the warnings.
  assert.doesNotMatch(digest, /בלי שיחה/);
  assert.doesNotMatch(digest, /🟡 [^*]*ג/);
  const lines = digest.split("\n");
  const callIndex = lines.findIndex((line) => line.startsWith("📞"));
  assert.equal(lines[callIndex - 1], "");
});

test("no call line when every client has a recent call", () => {
  const digest = buildPulseWhatsAppDigest(
    [
      { client_name: "א", status: "healthy", no_recent_client_call: false },
      { client_name: "ב", status: "healthy", no_recent_client_call: false },
    ],
    DASHBOARD,
  );
  assert.doesNotMatch(digest, /📞/);
  assert.match(digest, /🟢 \*2\* תקינים/);
});

test("single-client digest keeps healthy status and adds a separate call line", () => {
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
  assert.match(digest, /סטטוס: 🟢 תקין/);
  assert.match(digest, /📞 ללא שיחה מתועדת ב-14 הימים האחרונים/);
});

test("legacy snapshot with only the call flag reads as healthy plus no-call", () => {
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
  assert.match(digest, /🟡 \*0\* במגמה שלילית/);
  assert.match(digest, /🟢 \*2\* תקינים/);
  assert.match(digest, /📞 \*1\* ללא שיחה מתועדת/);
  assert.doesNotMatch(digest, /⚙️/);
});
