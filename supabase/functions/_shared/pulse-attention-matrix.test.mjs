import assert from "node:assert/strict";
import test from "node:test";

/** A campaign change from yesterday, so "no campaign touch" never fires by date alone. */
const RECENT_CHANGE = new Date(Date.now() - 86_400_000).toISOString();
import {
  buildPulseAttentionRows,
  evaluateEfficiencyIssue,
  readApprovedPlatformTarget,
  resolvePlatformTarget,
} from "./pulse-attention-matrix.mjs";

test("readApprovedPlatformTarget reads pulse_platform_targets", () => {
  assert.equal(
    readApprovedPlatformTarget(
      { pulse_platform_targets: { leads: { cpl: 90 } } },
      "leads",
    )?.value,
    90,
  );
});

test("resolvePlatformTarget no longer treats the 30-day baseline as a target", () => {
  assert.equal(resolvePlatformTarget({}, "leads", 75), null);
});

test("evaluateEfficiencyIssue is red only for a campaign that alerts", () => {
  const breach = {
    campaign_name: "לידים",
    status: "critical",
    status_tier: "exception",
    status_reason: "חריגה מתמשכת מהיעד המאושר (CPL 90)",
    alert_eligible: true,
    spend_7d: 800,
  };
  const issue = evaluateEfficiencyIssue({ campaignRows: [breach] });
  assert.equal(issue?.level, "alert");
  assert.match(issue.label, /CPL 90/);

  const silent = evaluateEfficiencyIssue({
    campaignRows: [{ ...breach, alert_eligible: false }],
  });
  assert.equal(silent?.level, "watch");
  assert.match(silent.label, /בלי התראה/);

  assert.equal(
    evaluateEfficiencyIssue({
      campaignRows: [{ ...breach, status: "healthy", status_tier: "normal" }],
    }),
    null,
  );
});

test("leads-only google table reclassifies mis-tagged ecommerce rows to CPL", () => {
  const rows = buildPulseAttentionRows({
    campaignRows: [
      {
        client_id: "client-2",
        table_id: "ga-leads",
        platform: "google",
        goal: "ecommerce",
        campaign_name: "בר תרגומים leads",
        spend_7d: 500,
        outcomes_7d: 20,
        revenue_7d: 0,
        efficiency_7d: 0.04,
        baseline_efficiency_7d: 0.05,
        trend_7d_pct: 12,
        last_change_at: RECENT_CHANGE,
      },
    ],
    tables: [
      {
        id: "ga-leads",
        client_id: "client-2",
        integration_type: "google_ads",
        integration_settings: { target_cpl: 35 },
      },
    ],
    clients: [
      {
        clientId: "client-2",
        clientName: "בר תרגומים",
        campaignerName: "דוד",
        moodStatus: "happy",
        lastClientCallAt: "2026-09-18T10:00:00Z",
        daysSinceLastCommunication: 3,
        recentCommunicationStatus: null,
        hasRecentComplaintUpdate: false,
      },
    ],
  });

  assert.equal(
    rows.length,
    0,
    "healthy CPL client should not appear only because of false ROAS",
  );
});

test("platform attention uses leads CPL when leads spend dominates mixed goals", () => {
  const rows = buildPulseAttentionRows({
    campaignRows: [
      {
        client_id: "client-1",
        platform: "meta",
        goal: "ecommerce",
        campaign_name: "misclassified shop",
        spend_7d: 50,
        outcomes_7d: 2,
        revenue_7d: 200,
        efficiency_7d: 4,
        baseline_efficiency_7d: 3.5,
        trend_7d_pct: 10,
        last_change_at: "2026-09-18T10:00:00Z",
      },
      {
        client_id: "client-1",
        platform: "meta",
        goal: "leads",
        campaign_name: "main leads",
        spend_7d: 900,
        outcomes_7d: 30,
        revenue_7d: 0,
        efficiency_7d: 30,
        baseline_efficiency_7d: 25,
        trend_7d_pct: 18,
        last_change_at: "2026-09-17T10:00:00Z",
      },
    ],
    tables: [
      {
        id: "table-leads",
        client_id: "client-1",
        integration_type: "facebook_insights",
        integration_settings: { target_roas: 4, target_cpl: 40 },
      },
    ],
    clients: [
      {
        clientId: "client-1",
        clientName: "דורון אקו",
        campaignerName: "דוד",
        moodStatus: "wavering",
        lastClientCallAt: "2026-09-18T10:00:00Z",
        daysSinceLastCommunication: 5,
        recentCommunicationStatus: null,
        hasRecentComplaintUpdate: false,
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].primaryGoal, "leads");
  assert.equal(rows[0].target?.kind, "cpl");
  assert.equal(rows[0].target?.value, 40);
  assert.equal(rows[0].currentEfficiency, 30);
});

test("buildPulseAttentionRows includes only rows with issues", () => {
  const rows = buildPulseAttentionRows({
    campaignRows: [
      {
        campaign_key: "meta:id:1",
        client_id: "client-1",
        platform: "meta",
        goal: "leads",
        spend_7d: 1000,
        outcomes_7d: 10,
        revenue_7d: 0,
        efficiency_7d: 100,
        baseline_efficiency_7d: 80,
        trend_7d_pct: 30,
        last_change_at: "2026-09-10T10:00:00Z",
      },
    ],
    tables: [
      {
        id: "table-1",
        client_id: "client-1",
        integration_type: "facebook_insights",
        integration_settings: {},
      },
    ],
    clients: [
      {
        clientId: "client-1",
        clientName: "לקוח א",
        campaignerName: "דוד",
        moodStatus: "happy",
        lastClientCallAt: "2026-08-01T10:00:00Z",
        daysSinceLastCommunication: 35,
        recentCommunicationStatus: null,
        hasRecentComplaintUpdate: false,
      },
    ],
  });
  assert.ok(rows.length >= 1);
  assert.ok(
    rows.some((row) => row.issues.efficiency || row.issues.lastCommunication),
  );
});

test("a Google sales campaign detected from its conversion goal keeps ROAS in a leads report", () => {
  const rows = buildPulseAttentionRows({
    campaignRows: [
      {
        client_id: "client-3",
        table_id: "ga-leads",
        platform: "google",
        goal: "ecommerce",
        classification_source: "platform_goal",
        campaign_name: "PMax",
        spend_7d: 1000,
        outcomes_7d: 2,
        revenue_7d: 500,
        efficiency_7d: 0.5,
        baseline_efficiency_7d: 3,
        trend_7d_pct: 83.3,
        last_change_at: RECENT_CHANGE,
        // As buildPulseCampaignRows classifies it against target_roas 3.
        status: "critical",
        status_tier: "exception",
        status_reason: "חריגה מתמשכת מהיעד המאושר (ROAS 3)",
        alert_eligible: true,
      },
    ],
    tables: [
      {
        id: "ga-leads",
        client_id: "client-3",
        integration_type: "google_ads",
        integration_settings: { target_roas: 3 },
      },
    ],
    clients: [
      {
        clientId: "client-3",
        clientName: "חנות",
        campaignerName: "דוד",
        moodStatus: "happy",
        lastClientCallAt: RECENT_CHANGE,
        daysSinceLastCommunication: 1,
        recentCommunicationStatus: null,
        hasRecentComplaintUpdate: false,
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].primaryGoal, "ecommerce");
  assert.equal(rows[0].target.kind, "roas");
  assert.equal(rows[0].currentEfficiency, 0.5);
});
