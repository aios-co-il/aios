import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  buildPulseCampaignRows,
  classifyPulseCampaignGoal,
  googleReportCampaignGoals,
  integrationTypeToGoal,
  isEcommerceReportTable,
  pulseCampaignOutcome,
  pulseTrendWindows,
} from "./pulse-campaign-goals.mjs";
import { buildInsightRecord } from "./fbInsights.ts";

Deno.test(
  "table helpers share one ecommerce definition across pulse and reports",
  () => {
    const ecommerceTable = {
      integration_type: "facebook_insights",
      category: "איקומרס",
      integration_settings: {},
    };
    assertStrictEquals(isEcommerceReportTable(ecommerceTable), true);
    assertStrictEquals(
      integrationTypeToGoal("facebook_insights", ecommerceTable),
      "ecommerce",
    );
    assertStrictEquals(
      integrationTypeToGoal("facebook_insights", {
        integration_type: "facebook_insights",
      }),
      "leads",
    );
  },
);

Deno.test("fbInsights sync output classifies identically in pulse", () => {
  const sales = buildInsightRecord(
    {
      date_start: "2026-09-17",
      campaign_id: "sale",
      campaign_name: "קמפיין מכירות | מבצעים ספטמבר",
      spend: "462.60",
      actions: [{ action_type: "omni_purchase", value: "2" }],
      action_values: [{ action_type: "omni_purchase", value: "1200" }],
    },
    {
      sale: {
        id: "sale",
        name: "קמפיין מכירות | מבצעים ספטמבר",
        objective: "OUTCOME_SALES",
        effective_status: "ACTIVE",
        configured_status: "ACTIVE",
      },
    },
    {},
    { sale: "OFFSITE_CONVERSIONS" },
  );
  assertStrictEquals(classifyPulseCampaignGoal(sales).goal, "ecommerce");

  const engagement = buildInsightRecord(
    {
      date_start: "2026-09-17",
      campaign_id: "eng",
      campaign_name: "קמפיין מעורבות | סרטונים חדש",
      spend: "10",
      actions: [{ action_type: "video_view", value: "20" }],
    },
    {
      eng: {
        id: "eng",
        name: "קמפיין מעורבות | סרטונים חדש",
        objective: "OUTCOME_ENGAGEMENT",
        effective_status: "ACTIVE",
        configured_status: "ACTIVE",
      },
    },
    {},
    { eng: "THRUPLAY" },
  );
  assertStrictEquals(classifyPulseCampaignGoal(engagement).goal, "engagement");
});

Deno.test(
  "classifies campaign objective and never defaults an unknown campaign to leads",
  () => {
    assertStrictEquals(
      classifyPulseCampaignGoal({ campaign_objective: "OUTCOME_LEADS" }).goal,
      "leads",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ campaign_objective: "OUTCOME_TRAFFIC" }).goal,
      "engagement",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ campaign_type: "traffic" }).goal,
      "engagement",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ optimization_goal: "THRUPLAY" }).goal,
      "engagement",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ campaign_objective: "OUTCOME_SALES" }).goal,
      "ecommerce",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ campaign_name: "קמפיין קיץ" }).goal,
      "unknown",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({
        campaign_objective: "OUTCOME_SALES",
        campaign_type: "lead",
      }).goal,
      "ecommerce",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({}, { integration_type: "facebook_ecommerce" })
        .goal,
      "ecommerce",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal(
        { campaign_type: "lead" },
        { integration_type: "facebook_insights", category: "איקומרס" },
      ).goal,
      "ecommerce",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal(
        { campaign_type: "lead" },
        { integration_type: "facebook_ecommerce" },
      ).goal,
      "ecommerce",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal(
        { campaign_type: "lead", campaign_objective: "OUTCOME_LEADS" },
        { integration_type: "facebook_ecommerce" },
      ).goal,
      "leads",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal(
        { campaign_objective: "OUTCOME_SALES" },
        { integration_settings: { campaign_type: "leads" } },
      ).goal,
      "ecommerce",
    );
  },
);

Deno.test(
  "Meta lead campaigns with LINK_CLICKS optimization classify as leads not engagement",
  () => {
    assertStrictEquals(
      classifyPulseCampaignGoal({
        campaign_type: "lead",
        campaign_objective: "OUTCOME_LEADS",
        optimization_goal: "LINK_CLICKS",
        link_clicks: 120,
        clicks: 120,
        result_kind: "link_clicks",
      }).goal,
      "leads",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({
        campaign_name: "דורון אקו | לידים",
        optimization_goal: "LINK_CLICKS",
        link_clicks: 45,
        result_kind: "link_clicks",
      }).goal,
      "leads",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({
        campaign_type: "traffic",
        optimization_goal: "LINK_CLICKS",
        link_clicks: 45,
        result_kind: "link_clicks",
      }).goal,
      "engagement",
    );
    assertEquals(pulseCampaignOutcome({ link_clicks: 45, leads: 3 }, "leads"), {
      value: 3,
      field: "leads",
      kind: "leads",
    });
  },
);

Deno.test(
  "WhatsApp / messaging lead campaigns classify as leads not engagement",
  () => {
    assertStrictEquals(
      classifyPulseCampaignGoal({
        campaign_name: "מעורבות | 18.8 - וואטסאפ",
        campaign_objective: "OUTCOME_ENGAGEMENT",
        optimization_goal: "LINK_CLICKS",
        link_clicks: 394,
        result_kind: "link_clicks",
      }).goal,
      "leads",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({
        campaign_name: "הלם פארם | לידים ווטסאפ",
        campaign_objective: "OUTCOME_ENGAGEMENT",
        optimization_goal: "CONVERSATIONS",
        conversations: 3,
      }).goal,
      "leads",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ optimization_goal: "CONVERSATIONS" }).goal,
      "leads",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ result_kind: "conversations" }).goal,
      "leads",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ result_kind: "messages" }).goal,
      "leads",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ optimization_goal: "THRUPLAY" }).goal,
      "engagement",
    );
    assertEquals(
      pulseCampaignOutcome({ conversations: 4, spend: 100 }, "leads"),
      { value: 4, field: "conversations", kind: "leads" },
    );
  },
);

Deno.test(
  "classifies from synced result_kind and Hebrew campaign names",
  () => {
    assertStrictEquals(
      classifyPulseCampaignGoal({ result_kind: "purchases" }).goal,
      "ecommerce",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ result_kind: "video_views" }).goal,
      "engagement",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({
        campaign_name: "קמפיין מכירות | מבצעים ספטמבר",
      }).goal,
      "ecommerce",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({
        campaign_name: "קמפיין מעורבות | סרטונים חדש",
      }).goal,
      "engagement",
    );
    assertStrictEquals(
      classifyPulseCampaignGoal({ campaign_name: "קמפיין לידים | דרושים" })
        .goal,
      "leads",
    );
  },
);

Deno.test(
  "Avieli Tayg production-shaped Meta rows classify from objective not table type",
  () => {
    const table = {
      id: "ccb8fbda-fd8f-4883-93e3-a59dc87563ab",
      client_id: "0117effa-063f-4579-989c-cdf8ec923fb9",
      integration_type: "facebook_insights",
      category: "Facebook Insights",
      integration_settings: {},
    };
    const specs = [
      {
        campaign_id: "sale",
        campaign_name: "‏‏‏‏קמפיין מכירות | מבצעים ספטמבר",
        campaign_objective: "OUTCOME_SALES",
        campaign_type: "ecommerce",
        spend: 462.54,
        purchases: 2,
        purchase_value: 1200,
      },
      {
        campaign_id: "eng",
        campaign_name: "‏קמפיין מעורבות | סרטונים‏ חדש",
        campaign_objective: "OUTCOME_ENGAGEMENT",
        campaign_type: "other",
        spend: 62.21,
        video_views: 20,
      },
      {
        campaign_id: "wa",
        campaign_name: "‏קמפיין ווטסאפ | ברזל",
        campaign_objective: "OUTCOME_ENGAGEMENT",
        campaign_type: "other",
        spend: 348.77,
        conversations: 4,
      },
      {
        campaign_id: "lead",
        campaign_name: "קמפיין לידים | דרושים",
        campaign_objective: "OUTCOME_LEADS",
        campaign_type: "lead",
        spend: 42.74,
        leads: 0,
      },
    ];
    const dates = [
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ];
    const records = [];
    for (const date of dates) {
      for (const spec of specs) {
        records.push({
          table_id: table.id,
          data: { date, entity_level: "campaign", ...spec },
        });
      }
    }
    const rows = buildPulseCampaignRows({
      records,
      tables: [table],
      nowYmd: "2026-09-18",
    }).filter((row) => row.spend_7d > 0);
    assertEquals(rows.map((row) => row.goal).sort(), [
      "ecommerce",
      "engagement",
      "leads",
      "leads",
    ]);
  },
);

Deno.test(
  "Avieli Tayg-style mixed Meta account splits into leads, engagement, and ecommerce",
  () => {
    const tables = [
      {
        id: "t-meta",
        client_id: "avieli",
        integration_type: "facebook_ecommerce",
        integration_settings: {},
      },
    ];
    const dates = [
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ];
    const specs = [
      {
        campaign_id: "eng",
        campaign_name: "קמפיין מעורבות | סרטונים חדש",
        campaign_objective: "OUTCOME_ENGAGEMENT",
        optimization_goal: "THRUPLAY",
        spend: 10,
        video_views: 20,
      },
      {
        campaign_id: "sale",
        campaign_name: "קמפיין מכירות | מבצעים ספטמבר",
        campaign_objective: "OUTCOME_SALES",
        optimization_goal: "OFFSITE_CONVERSIONS",
        spend: 50,
        purchases: 1,
        purchase_value: 100,
      },
      {
        campaign_id: "wa",
        campaign_name: "קמפיין ווטסאפ | ברזל",
        campaign_objective: "OUTCOME_ENGAGEMENT",
        optimization_goal: "CONVERSATIONS",
        spend: 30,
        conversations: 4,
      },
      {
        campaign_id: "lead",
        campaign_name: "קמפיין לידים | דרושים",
        campaign_objective: "OUTCOME_LEADS",
        optimization_goal: "LEAD_GENERATION",
        spend: 5,
        leads: 1,
      },
      {
        campaign_id: "off",
        campaign_name: "קמפיין מכירות | מבצעים אוגוסט 2",
        campaign_objective: "OUTCOME_SALES",
        effective_status: "PAUSED",
        spend: 0,
      },
    ];
    const records = [];
    for (const date of dates) {
      for (const spec of specs) {
        records.push({
          table_id: "t-meta",
          data: { date, entity_level: "campaign", ...spec },
        });
      }
    }
    const rows = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    });
    assertEquals(rows.map((row) => row.goal).sort(), [
      "ecommerce",
      "ecommerce",
      "engagement",
      "leads",
      "leads",
    ]);
    const spending = rows.filter((row) => row.spend_7d > 0);
    assertStrictEquals(spending.length, 4);
    assertStrictEquals(
      spending.find((row) => row.campaign_id === "off"),
      undefined,
    );
  },
);

Deno.test(
  "ecommerce report tables classify purchase campaigns and rebuild mixed clients",
  () => {
    const tables = [
      {
        id: "t-ecom",
        client_id: "abihail",
        integration_type: "facebook_ecommerce",
        integration_settings: {},
      },
    ];
    const dates = [
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ];
    const records = [];
    for (const date of dates) {
      records.push(
        {
          table_id: "t-ecom",
          data: {
            date,
            campaign_id: "sale",
            campaign_name: "Purchase",
            campaign_objective: "OUTCOME_SALES",
            campaign_type: "ecommerce",
            spend: 40,
            purchases: 2,
            purchase_value: 200,
          },
        },
        {
          table_id: "t-ecom",
          data: {
            date,
            campaign_id: "video",
            campaign_name: "Views",
            campaign_objective: "OUTCOME_ENGAGEMENT",
            optimization_goal: "THRUPLAY",
            campaign_type: "traffic",
            spend: 20,
            video_views: 50,
          },
        },
        {
          table_id: "t-ecom",
          data: {
            date,
            campaign_id: "lead",
            campaign_name: "Lead form",
            campaign_objective: "OUTCOME_LEADS",
            campaign_type: "lead",
            spend: 10,
            leads: 1,
          },
        },
      );
    }
    const rows = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    });
    assertEquals(rows.map((row) => row.goal).sort(), [
      "ecommerce",
      "engagement",
      "leads",
    ]);
    const purchase = rows.find((row) => row.campaign_id === "sale");
    assertStrictEquals(purchase.outcome_kind, "purchases");
    assertStrictEquals(purchase.outcomes_7d, 14);
  },
);

Deno.test(
  "keeps a missing outcome missing instead of converting it to zero",
  () => {
    assertStrictEquals(
      pulseCampaignOutcome({ spend: 100 }, "engagement").value,
      null,
    );
    assertStrictEquals(
      pulseCampaignOutcome({ clicks: 0 }, "engagement").value,
      0,
    );
  },
);

Deno.test(
  "uses complete days for trends and still fetches today as a partial window",
  () => {
    assertEquals(pulseTrendWindows("2026-09-18"), {
      current3: { start: "2026-09-15", end: "2026-09-17" },
      current7: { start: "2026-09-11", end: "2026-09-17" },
      baseline: { start: "2026-08-14", end: "2026-09-10" },
      today: "2026-09-18",
      queryStart: "2026-08-14",
      queryEnd: "2026-09-18",
    });
  },
);

Deno.test(
  "merges duplicate Meta tables when the same campaign name uses different ids",
  () => {
    const tables = [
      {
        id: "meta-main",
        client_id: "c1",
        integration_type: "facebook_insights",
        integration_settings: {},
      },
      {
        id: "meta-copy",
        client_id: "c1",
        integration_type: "facebook_insights",
        integration_settings: {},
      },
    ];
    const dates = [
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ];
    const records = [];
    for (const date of dates) {
      records.push(
        {
          table_id: "meta-main",
          data: {
            date,
            campaign_id: "111",
            campaign_name: "לידים חדש משוכפל",
            campaign_type: "lead",
            spend: 20,
            leads: 1,
          },
        },
        {
          table_id: "meta-copy",
          data: {
            date,
            campaign_id: "222",
            campaign_name: "לידים חדש משוכפל",
            campaign_type: "lead",
            spend: 20,
            leads: 1,
          },
        },
      );
    }
    const rows = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    });
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0].campaign_name, "לידים חדש משוכפל");
    assertStrictEquals(rows[0].spend_7d, 140);
    assertStrictEquals(rows[0].outcomes_7d, 7);
  },
);

Deno.test(
  "splits a mixed client into three categories without double counting duplicate Meta tables",
  () => {
    const tables = [
      {
        id: "meta-main",
        client_id: "c1",
        integration_type: "facebook_insights",
        integration_settings: {},
      },
      {
        id: "meta-copy",
        client_id: "c1",
        integration_type: "facebook_ecommerce",
        integration_settings: {},
      },
    ];
    const dates = [
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ];
    const records = [];
    for (const date of dates) {
      records.push(
        {
          table_id: "meta-main",
          data: {
            date,
            campaign_id: "lead",
            campaign_name: "Lead",
            campaign_type: "lead",
            spend: 10,
            leads: 1,
          },
        },
        {
          table_id: "meta-main",
          data: {
            date,
            campaign_id: "eng",
            campaign_name: "Video",
            campaign_type: "traffic",
            spend: 20,
            video_views: 10,
          },
        },
        {
          table_id: "meta-main",
          data: {
            date,
            campaign_id: "sale",
            campaign_name: "Sale",
            campaign_type: "ecommerce",
            spend: 30,
            purchases: 2,
            purchase_value: 120,
          },
        },
        // Duplicate daily campaign from a second synced Meta table: must not be counted twice.
        {
          table_id: "meta-copy",
          data: {
            date,
            campaign_id: "sale",
            campaign_name: "Sale",
            campaign_type: "ecommerce",
            spend: 30,
            purchases: 2,
            purchase_value: 120,
          },
        },
      );
    }
    const rows = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    });
    assertEquals(rows.map((row) => row.goal).sort(), [
      "ecommerce",
      "engagement",
      "leads",
    ]);
    assertStrictEquals(
      rows.reduce((total, row) => total + row.spend_7d, 0),
      420,
    );
  },
);

Deno.test(
  "CPL increase inside an approved target stays healthy and is not alert eligible",
  () => {
    const tables = [
      {
        id: "t1",
        client_id: "c1",
        integration_type: "facebook_insights",
        integration_settings: { target_cpl: 50 },
      },
    ];
    const records = [];
    for (let day = 14; day <= 17; day += 1) {
      records.push({
        table_id: "t1",
        data: {
          date: `2026-09-${day}`,
          campaign_id: "lead",
          campaign_type: "lead",
          spend: 40,
          leads: 1,
        },
      });
    }
    const row = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    })[0];
    assertStrictEquals(row.efficiency_7d, 40);
    assertStrictEquals(row.status, "healthy");
    assertStrictEquals(row.alert_eligible, false);
    assertMatch(row.status_reason, /בתוך היעד/);
  },
);

Deno.test("paused campaigns with spend but no leads are not critical", () => {
  const tables = [
    {
      id: "t1",
      client_id: "c1",
      integration_type: "facebook_insights",
      integration_settings: {},
    },
  ];
  const records = [];
  for (let day = 11; day <= 17; day += 1) {
    records.push({
      table_id: "t1",
      data: {
        date: `2026-09-${day}`,
        campaign_id: "bad",
        campaign_name: "Old test",
        campaign_type: "lead",
        effective_status: "PAUSED",
        spend: 80,
        leads: 0,
      },
    });
  }
  const row = buildPulseCampaignRows({
    records,
    tables,
    nowYmd: "2026-09-18",
  })[0];
  assertStrictEquals(row.delivery_status, "paused");
  assertStrictEquals(row.status, "healthy");
  assertMatch(row.status_reason, /מושהה/);
});

Deno.test(
  "pulse_platform_targets apply before campaign-specific overrides",
  () => {
    const tables = [
      {
        id: "t1",
        client_id: "c1",
        integration_type: "facebook_insights",
        integration_settings: {
          pulse_platform_targets: { leads: { cpl: 40 } },
          pulse_targets: { default: { cpl: 80 } },
        },
      },
    ];
    const records = [];
    for (let day = 11; day <= 17; day += 1) {
      records.push({
        table_id: "t1",
        data: {
          date: `2026-09-${day}`,
          campaign_id: "lead",
          campaign_name: "Leads",
          campaign_type: "lead",
          spend: 50,
          leads: 1,
        },
      });
    }
    const row = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    })[0];
    assertStrictEquals(row.target_value, 40);
    assertStrictEquals(row.status, "critical");
  },
);

Deno.test(
  "persistent target breach becomes an evidence-backed exception",
  () => {
    const tables = [
      {
        id: "t1",
        client_id: "c1",
        integration_type: "facebook_insights",
        integration_settings: { target_cpl: 30 },
      },
    ];
    const records = [];
    for (let day = 11; day <= 17; day += 1) {
      records.push({
        table_id: "t1",
        data: {
          date: `2026-09-${day}`,
          campaign_id: "lead",
          campaign_name: "Leads",
          campaign_type: "lead",
          spend: 50,
          leads: 1,
        },
      });
    }
    const row = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    })[0];
    assertStrictEquals(row.status, "critical");
    assertStrictEquals(row.alert_eligible, true);
    assertStrictEquals(row.target_value, 30);
  },
);

Deno.test(
  "afternoon partial today is shown separately and does not inflate the 7-day window",
  () => {
    const tables = [
      {
        id: "t1",
        client_id: "c1",
        integration_type: "facebook_insights",
        integration_settings: {
          last_sync_at: "2026-09-18T11:00:00.000Z",
          last_campaign_updated_at: "2026-09-18T10:30:00.000Z",
          last_meta_activity: {
            at: "2026-09-18T10:45:00.000Z",
            type: "updated ad",
            actor: "דנה",
            object: "Lead",
          },
        },
      },
    ];
    const records = [
      {
        table_id: "t1",
        data: {
          date: "2026-09-17",
          campaign_id: "lead",
          campaign_type: "lead",
          spend: 70,
          leads: 1,
          updated_time: "2026-09-17T08:00:00.000Z",
        },
      },
      {
        table_id: "t1",
        data: {
          date: "2026-09-18",
          campaign_id: "lead",
          campaign_type: "lead",
          spend: 999,
          leads: 9,
          updated_time: "2026-09-18T09:00:00.000Z",
        },
      },
    ];
    const row = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    })[0];
    assertStrictEquals(row.spend_7d, 70);
    assertStrictEquals(row.spend_today, 999);
    assertStrictEquals(row.outcomes_today, 9);
    assertStrictEquals(row.today_partial_included, true);
    assertStrictEquals(row.data_fresh_through, "2026-09-18");
    assertStrictEquals(row.last_change_at, "2026-09-18T10:45:00.000Z");
    assertStrictEquals(row.last_sync_at, "2026-09-18T11:00:00.000Z");
  },
);

Deno.test(
  "Google Ads verified_leads=0 must not mask metrics.conversions in pulse",
  () => {
    assertEquals(
      pulseCampaignOutcome({ verified_leads: 0, conversions: 7 }, "leads"),
      { value: 7, field: "conversions", kind: "leads" },
    );

    const tables = [
      {
        id: "ga1",
        client_id: "c1",
        integration_type: "google_ads",
        integration_settings: {},
      },
    ];
    const records = [
      {
        table_id: "ga1",
        data: {
          date: "2026-09-17",
          entity_level: "campaign",
          campaign_id: "g1",
          campaign_name: "Lead campaign",
          cost: 44,
          conversions: 7,
          verified_leads: 0,
        },
      },
      {
        table_id: "ga1",
        data: {
          date: "2026-09-18",
          entity_level: "campaign",
          campaign_id: "g1",
          campaign_name: "Lead campaign",
          cost: 15,
          conversions: 2,
          verified_leads: 0,
        },
      },
    ];
    const row = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-20",
    })[0];
    assertStrictEquals(row.outcomes_7d, 9);
    assertStrictEquals(row.spend_7d, 59);
  },
);

Deno.test(
  "one campaign keeps one goal across days instead of splitting into categories",
  () => {
    const tables = [
      {
        id: "g",
        client_id: "c1",
        integration_type: "google_ads",
        integration_settings: {},
      },
    ];
    const records = [
      ...["2026-09-11", "2026-09-12", "2026-09-13"].map((date) => ({
        table_id: "g",
        data: {
          date,
          campaign_id: "pmax",
          campaign_name: "PMax",
          campaign_type: "ecommerce",
          spend: 50,
          clicks: 40,
          purchases: 1,
          purchase_value: 300,
        },
      })),
      ...["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"].map(
        (date) => ({
          table_id: "g",
          data: {
            date,
            campaign_id: "pmax",
            campaign_name: "PMax",
            spend: 10,
            clicks: 30,
          },
        }),
      ),
    ];
    const rows = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    });
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0].goal, "ecommerce");
    assertStrictEquals(rows[0].spend_7d, 190);
  },
);

// Real Google Ads sync rows: `cost`, `conversions`, `conversions_value` — no spend,
// purchases, objective or campaign_type.
const googleTable = (id, settings = {}, category = "Google Ads") => ({
  id,
  client_id: "c1",
  integration_type: "google_ads",
  integration_settings: settings,
  category,
});
const googleRow = (table_id, date, data) => ({
  table_id,
  data: { date, entity_level: "campaign", ...data },
});
const lastWeek = [
  "2026-10-17",
  "2026-10-18",
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
];

Deno.test("google lead campaign with valued conversions stays leads", () => {
  const goal = classifyPulseCampaignGoal(
    {
      campaign_name: "PMax כללי",
      cost: 100,
      conversions: 3,
      conversions_value: 3,
    },
    googleTable("g", { campaign_type: "leads" }),
  );
  assertStrictEquals(goal.goal, "leads");
});

Deno.test("google ecommerce campaign counts conversions as purchases", () => {
  const data = {
    campaign_name: "PMax",
    cost: 100,
    conversions: 2,
    conversions_value: 600,
  };
  const goal = classifyPulseCampaignGoal(
    data,
    googleTable("g", { campaign_type: "ecommerce" }, "איקומרס"),
  );
  assertStrictEquals(goal.goal, "ecommerce");
  assertEquals(pulseCampaignOutcome(data, "ecommerce"), {
    value: 2,
    field: "conversions",
    kind: "purchases",
  });
});

Deno.test(
  "google clicks-only day keeps the report goal instead of engagement",
  () => {
    const goal = classifyPulseCampaignGoal(
      {
        campaign_name: "PMax",
        cost: 20,
        clicks: 30,
        conversions: 0,
        conversions_value: 0,
      },
      googleTable("g", { campaign_type: "ecommerce" }, "איקומרס"),
    );
    assertStrictEquals(goal.goal, "ecommerce");
  },
);

Deno.test("google conversion_goal from the sync beats the report type", () => {
  const goal = classifyPulseCampaignGoal(
    {
      campaign_name: "PMax",
      conversion_goal: "ecommerce",
      cost: 50,
      conversions: 1,
    },
    googleTable("g", { campaign_type: "leads" }),
  );
  assertEquals(goal, { goal: "ecommerce", source: "platform_goal" });
});

Deno.test("a manual per-campaign goal beats every other signal", () => {
  const goal = classifyPulseCampaignGoal(
    { campaign_id: "77", campaign_name: "PMax", conversion_goal: "ecommerce" },
    googleTable("g", { pulse_campaign_goals: { 77: "leads" } }),
  );
  assertEquals(goal, { goal: "leads", source: "explicit_mapping" });
});

Deno.test(
  "google ecommerce PMax with quiet days is one ecommerce campaign with its sales",
  () => {
    const records = lastWeek.map((date, i) =>
      googleRow("e", date, {
        campaign_id: "1",
        campaign_name: "PMax",
        cost: i < 5 ? 20 : 500,
        clicks: 30,
        conversions: i < 5 ? 0 : 3,
        conversions_value: i < 5 ? 0 : 900,
      }),
    );
    const rows = buildPulseCampaignRows({
      records,
      tables: [googleTable("e", { campaign_type: "ecommerce" }, "איקומרס")],
      nowYmd: "2026-10-24",
    });
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0].goal, "ecommerce");
    assertStrictEquals(rows[0].outcome_kind, "purchases");
    assertStrictEquals(rows[0].outcomes_7d, 6);
    assertStrictEquals(rows[0].revenue_7d, 1800);
    assertStrictEquals(rows[0].spend_7d, 1100);
  },
);

Deno.test(
  "one google account can hold an ecommerce PMax and a lead Search campaign",
  () => {
    const records = lastWeek.flatMap((date) => [
      googleRow("g", date, {
        campaign_id: "pmax",
        campaign_name: "PMax",
        campaign_channel_type: "PERFORMANCE_MAX",
        conversion_goal: "ecommerce",
        cost: 100,
        conversions: 1,
        conversions_value: 400,
      }),
      googleRow("g", date, {
        campaign_id: "search",
        campaign_name: "Search",
        campaign_channel_type: "SEARCH",
        conversion_goal: "leads",
        cost: 50,
        conversions: 2,
        conversions_value: 2,
      }),
    ]);
    const rows = buildPulseCampaignRows({
      records,
      tables: [googleTable("g", { campaign_type: "leads" })],
      nowYmd: "2026-10-24",
    });
    const byId = Object.fromEntries(rows.map((row) => [row.campaign_id, row]));
    assertStrictEquals(byId.pmax.goal, "ecommerce");
    assertStrictEquals(byId.pmax.outcomes_7d, 7);
    assertStrictEquals(byId.search.goal, "leads");
    assertStrictEquals(byId.search.outcomes_7d, 14);
  },
);

Deno.test(
  "rows synced before the goal was stamped do not outvote the stamped rows",
  () => {
    const records = lastWeek.map((date, i) =>
      googleRow("g", date, {
        campaign_id: "pmax",
        campaign_name: "PMax",
        cost: i < 5 ? 500 : 20,
        conversions: 1,
        ...(i >= 5 ? { conversion_goal: "ecommerce" } : {}),
      }),
    );
    const rows = buildPulseCampaignRows({
      records,
      tables: [googleTable("g", { campaign_type: "leads" })],
      nowYmd: "2026-10-24",
    });
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0].goal, "ecommerce");
  },
);

Deno.test("reports get each Google campaign's own goal", () => {
  const records = lastWeek.flatMap((date) => [
    googleRow("g", date, {
      campaign_id: "pmax-shop",
      campaign_name: "PMax חנות",
      conversion_goal: "ecommerce",
      cost: 100,
    }),
    googleRow("g", date, {
      campaign_id: "pmax-leads",
      campaign_name: "PMax כללי",
      conversion_goal: "leads",
      cost: 100,
      conversions_value: 5,
    }),
    googleRow("g", date, {
      campaign_id: "search",
      campaign_name: "Search",
      cost: 50,
    }),
  ]);
  const goals = googleReportCampaignGoals({
    records,
    tables: [googleTable("g", { campaign_type: "ecommerce" }, "איקומרס")],
  });
  assertStrictEquals(goals.get("pmax-shop"), "ecommerce");
  assertStrictEquals(goals.get("pmax-leads"), "leads");
  assertStrictEquals(goals.get("search"), "ecommerce");
});
