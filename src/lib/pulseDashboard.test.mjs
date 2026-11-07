import { expect, test } from "vitest";

import {
  applyClientCallToPulseSnapshot,
  buildPulseDashboardUrl,
  clientHasCampaignService,
  filterPulseCallFlags,
  collectCampaignBreakdownFromSnapshots,
  pulseClientsNeedingRecordBuild,
  pulseFallbackTableIds,
  rehydrateCampaignBreakdownRows,
  rollupCampaignRowsByClientGoal,
  rollupStatusFromCampaigns,
  formatPulseChange,
  getPulsePeriodBounds,
  platformGoalLabel,
  pulseSpendColumnLabel,
  pulseStatusToOverall,
} from "./pulseDashboard.ts";

test("maps pulse statuses to traffic lights", () => {
  expect(pulseStatusToOverall("healthy")).toBe("green");
  expect(pulseStatusToOverall("warning")).toBe("yellow");
  expect(pulseStatusToOverall("no_data")).toBe("yellow");
  expect(pulseStatusToOverall("critical")).toBe("red");
});

test("detects campaign services", () => {
  expect(clientHasCampaignService(["seo"])).toBe(false);
  expect(clientHasCampaignService(["ppc_meta", "seo"])).toBe(true);
  expect(clientHasCampaignService(["ppc_google"])).toBe(true);
});

test("formats change and share URLs", () => {
  expect(formatPulseChange(12.5)).toBe("+12.5%");
  expect(formatPulseChange(-3)).toBe("-3%");
  expect(buildPulseDashboardUrl("https://aios.co.il", "marketingcaptain")).toBe(
    "https://aios.co.il/t/marketingcaptain/dmm-dashboard",
  );
  expect(
    buildPulseDashboardUrl("https://aios.co.il/", "marketingcaptain", "abc"),
  ).toBe("https://aios.co.il/t/marketingcaptain/dmm-dashboard?agency=abc");
});

test("filters call-freshness flags from pulse notes column", () => {
  expect(
    filterPulseCallFlags([
      "CPL עלה ב-30%",
      "לא תועדה שיחה טלפונית עם הלקוח",
      "קמפיין נעצר",
      "לא תועדה שיחה טלפונית עם הלקוח ב-14 הימים האחרונים",
    ]),
  ).toStrictEqual(["CPL עלה ב-30%", "קמפיין נעצר"]);
});

test("recalculates pulse status after a fresh client call is logged", () => {
  const now = "2026-08-25T12:00:00.000Z";
  const base = {
    client_id: "c1",
    agency_id: null,
    status: "warning",
    campaign_goal_mode: "leads",
    is_ecommerce: false,
    spend_7d: 100,
    leads_7d: 5,
    cpl_7d: 20,
    cpl_change_pct: 0,
    purchases_7d: 0,
    revenue_7d: 0,
    roas_7d: null,
    lead_goal_status: "warning",
    ecommerce_goal_status: null,
    flags: ["לא תועדה שיחה טלפונית עם הלקוח"],
    data_fresh_through: "2026-08-24",
    calculated_at: now,
    last_meta_change_at: null,
    last_meta_change_type: null,
    last_meta_change_actor: null,
    last_meta_change_object: null,
    meta_change_availability: "ok",
    last_client_call_at: null,
    last_client_call_by: null,
  };

  const next = applyClientCallToPulseSnapshot(base, now, "דוד");
  expect(next.status).toBe("healthy");
  expect(next.lead_goal_status).toBe("healthy");
  expect(next.flags).toStrictEqual([]);
  expect(next.last_client_call_by).toBe("דוד");
});

test("keeps warning status when other flags remain after call is logged", () => {
  const now = "2026-08-25T12:00:00.000Z";
  const base = {
    client_id: "c1",
    agency_id: null,
    status: "warning",
    campaign_goal_mode: "leads",
    is_ecommerce: false,
    spend_7d: 100,
    leads_7d: 5,
    cpl_7d: 20,
    cpl_change_pct: 30,
    purchases_7d: 0,
    revenue_7d: 0,
    roas_7d: null,
    lead_goal_status: "warning",
    ecommerce_goal_status: null,
    flags: ["CPL עלה ב-30%", "לא תועדה שיחה טלפונית עם הלקוח"],
    data_fresh_through: "2026-08-24",
    calculated_at: now,
    last_meta_change_at: null,
    last_meta_change_type: null,
    last_meta_change_actor: null,
    last_meta_change_object: null,
    meta_change_availability: "ok",
    last_client_call_at: null,
    last_client_call_by: null,
  };

  const next = applyClientCallToPulseSnapshot(base, now, "דוד");
  expect(next.status).toBe("warning");
  expect(next.flags).toStrictEqual(["CPL עלה ב-30%"]);
});

test("last_week bounds are previous Sun–Sat (Jerusalem calendar)", () => {
  // Wednesday 2026-08-05 Asia/Jerusalem → last week Sun 2026-07-26 .. Sat 2026-08-01
  const bounds = getPulsePeriodBounds(
    "last_week",
    new Date("2026-08-05T12:00:00+03:00"),
  );
  expect(bounds.startDate).toBe("2026-07-26");
  expect(bounds.endDate).toBe("2026-08-01");
  expect(bounds.prevStartDate).toBe("2026-07-19");
  expect(bounds.prevEndDate).toBe("2026-07-25");
  expect(bounds.label).toBe("שבוע שעבר");
  expect(pulseSpendColumnLabel("last_week")).toBe("הוצאה שבוע שעבר");
});

test("this_week bounds start on Sunday through today", () => {
  const bounds = getPulsePeriodBounds(
    "this_week",
    new Date("2026-08-05T12:00:00+03:00"),
  );
  expect(bounds.startDate).toBe("2026-08-02");
  expect(bounds.endDate).toBe("2026-08-05");
});

test("a platform goal row is labelled by platform and goal", () => {
  expect(platformGoalLabel({ platformLabel: "Meta", goal: "leads" })).toBe(
    "Meta · לידים",
  );
  expect(
    platformGoalLabel({ platformLabel: "Google", goal: "ecommerce" }),
  ).toBe("Google · איקומרס");
});

test("prefers stored snapshot breakdown and only rebuilds clients without it", () => {
  const snapshots = [
    {
      client_id: "c1",
      campaign_breakdown: [
        { campaign_key: "meta:id:1", client_id: "c1", goal: "leads" },
      ],
    },
    { client_id: "c2" },
  ];
  const tables = [
    { id: "t1", client_id: "c1", integration_type: "facebook_insights" },
    { id: "t2", client_id: "c2", integration_type: "google_ads" },
  ];
  expect(collectCampaignBreakdownFromSnapshots(snapshots)).toStrictEqual(
    snapshots[0].campaign_breakdown,
  );
  expect(pulseClientsNeedingRecordBuild({ snapshots, tables })).toStrictEqual([
    "c2",
  ]);
  const paused = rehydrateCampaignBreakdownRows(
    [
      {
        campaign_key: "meta:id:1",
        client_id: "c1",
        table_id: "t1",
        campaign_id: "1",
        platform: "meta",
        goal: "leads",
        status: "critical",
        status_tier: "exception",
        status_reason: "old",
        alert_eligible: true,
        spend_7d: 100,
        outcomes_7d: 0,
      },
    ],
    tables,
    [
      {
        table_id: "t1",
        campaign_id: "1",
        effective_status: "PAUSED",
        date: "2026-09-17",
      },
    ],
  );
  expect(paused[0].delivery_status).toBe("paused");
  expect(paused[0].status).toBe("healthy");
  expect(pulseFallbackTableIds(tables, ["c2"])).toStrictEqual(["t2"]);
});

test("rolls per-campaign rows into one client card per platform and goal", () => {
  const campaignRows = [
    {
      campaign_key: "meta:id:1",
      campaign_id: "1",
      campaign_name: "Leads A",
      client_id: "c1",
      table_id: "t1",
      platform: "meta",
      goal: "leads",
      status: "healthy",
      status_reason: "ok",
      delivery_status: "active",
      spend_7d: 100,
      outcomes_7d: 5,
      revenue_7d: 0,
      trend_7d_pct: 10,
      last_change_at: "2026-09-10T08:00:00.000Z",
      data_fresh_through: "2026-09-17",
    },
    {
      campaign_key: "meta:id:2",
      campaign_id: "2",
      campaign_name: "Leads B",
      client_id: "c1",
      table_id: "t1",
      platform: "meta",
      goal: "leads",
      status: "critical",
      status_reason: "bad",
      delivery_status: "active",
      spend_7d: 50,
      outcomes_7d: 0,
      revenue_7d: 0,
      trend_7d_pct: null,
      last_change_at: "2026-09-12T09:00:00.000Z",
      data_fresh_through: "2026-09-17",
    },
    {
      campaign_key: "google:id:3",
      campaign_id: "3",
      campaign_name: "Video",
      client_id: "c1",
      table_id: "t2",
      platform: "google",
      goal: "engagement",
      status: "warning",
      status_reason: "watch",
      spend_7d: 30,
      outcomes_7d: 12,
      revenue_7d: 0,
      trend_7d_pct: 5,
      last_change_at: "2026-09-11T07:00:00.000Z",
      data_fresh_through: "2026-09-16",
    },
  ];
  const snapshots = new Map([
    [
      "c1",
      {
        client_id: "c1",
        agency_id: null,
        status: "warning",
        is_ecommerce: false,
        spend_7d: 180,
        leads_7d: 5,
        cpl_7d: null,
        cpl_change_pct: null,
        purchases_7d: null,
        revenue_7d: null,
        roas_7d: null,
        flags: [],
        data_fresh_through: "2026-09-17",
        calculated_at: "2026-09-18T08:00:00.000Z",
        last_meta_change_at: "2026-09-13T10:00:00.000Z",
        last_meta_change_type: "updated ad",
        last_meta_change_actor: "דנה",
        last_meta_change_object: "Lead",
        meta_change_availability: "available",
        last_client_call_at: "2026-09-15T12:00:00.000Z",
        last_client_call_by: "David",
      },
    ],
  ]);
  const rollups = rollupCampaignRowsByClientGoal({
    campaignRows,
    snapshotsByClient: snapshots,
  });
  expect(rollups.length).toBe(2);
  const metaLeads = rollups.find(
    (row) => row.platform === "meta" && row.goal === "leads",
  );
  expect(metaLeads.campaigns.length).toBe(2);
  expect(metaLeads.status).toBe("critical");
  expect(metaLeads.spend_7d).toBe(150);
  expect(metaLeads.last_campaign_change_at).toBe("2026-09-13T10:00:00.000Z");
  expect(metaLeads.last_client_call_at).toBe("2026-09-15T12:00:00.000Z");
  const googleEngagement = rollups.find(
    (row) => row.platform === "google" && row.goal === "engagement",
  );
  expect(googleEngagement.last_campaign_change_at).toBe(
    "2026-09-11T07:00:00.000Z",
  );
});

test("rollup: paused-unknown critical does not flash red before Meta hints land", () => {
  const base = {
    client_id: "maimad",
    table_id: "t-meta",
    platform: "meta",
    goal: "leads",
    spend_7d: 100,
    outcomes_7d: 5,
    revenue_7d: 0,
  };
  // Snapshot rows: delivery_status not stored yet — one paused campaign still marked critical.
  const beforeHints = [
    {
      ...base,
      campaign_key: "meta:id:1",
      campaign_id: "1",
      campaign_name: "Leads A",
      status: "healthy",
      status_reason: "ok",
    },
    {
      ...base,
      campaign_key: "meta:id:2",
      campaign_id: "2",
      campaign_name: "Leads B",
      status: "healthy",
      status_reason: "ok",
    },
    {
      ...base,
      campaign_key: "meta:id:3",
      campaign_id: "3",
      campaign_name: "Old paused",
      status: "critical",
      status_reason: "קמפיין נעצר",
    },
  ];

  expect(
    rollupStatusFromCampaigns(beforeHints, { deliveryHintsPending: true })
      .status,
  ).toBe("warning");
  expect(rollupStatusFromCampaigns(beforeHints).status).toBe("warning");

  const afterHints = [
    { ...beforeHints[0], delivery_status: "active" },
    { ...beforeHints[1], delivery_status: "active" },
    {
      ...beforeHints[2],
      delivery_status: "paused",
      status: "healthy",
      status_reason: "קמפיין מושהה — אין הוצאה פעילה שדורשת טיפול",
    },
  ];
  expect(rollupStatusFromCampaigns(afterHints).status).toBe("healthy");
});

test("rollup: every campaign paused on an active report is a warning", () => {
  const paused = (goal, id) => ({
    client_id: "roma",
    table_id: "t-meta",
    platform: "meta",
    goal,
    campaign_key: `meta:id:${id}`,
    campaign_id: id,
    campaign_name: `C${id}`,
    spend_7d: 50,
    outcomes_7d: 2,
    revenue_7d: 0,
    status: "healthy",
    status_reason: "ok",
    delivery_status: "paused",
  });

  const allPaused = rollupStatusFromCampaigns([paused("leads", "1")]);
  expect(allPaused.status).toBe("warning");
  expect(allPaused.status_reason).toContain("הדוח פעיל");

  // Another campaign of the client on the same platform is live: fine.
  expect(
    rollupStatusFromCampaigns([paused("leads", "1")], { liveElsewhere: true })
      .status,
  ).toBe("healthy");

  const rollups = rollupCampaignRowsByClientGoal({
    campaignRows: [
      paused("leads", "1"),
      { ...paused("ecommerce", "2"), delivery_status: "active" },
    ],
    snapshotsByClient: new Map(),
  });
  const leads = rollups.find((row) => row.goal === "leads");
  expect(leads?.status).toBe("healthy");
  expect(leads?.status_reason).toContain("קמפיין אחר של הלקוח באוויר");
});
