import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  buildPulseCampaignRows,
  pulseTrendWindows,
} from "./pulse-campaign-goals.mjs";
import { reportCampaignGoalOf } from "./campaign-goal/campaign-goals.ts";
import { goalResultCount } from "./campaign-goal/outcomes.ts";
import { buildInsightRecord } from "./fbInsights.ts";

Deno.test("fbInsights sync output gets the report goal in the pulse", () => {
  const table = { id: "t", integration_type: "facebook_insights" };
  const reportGoal = (data) => {
    const record = { table_id: "t", data };
    return reportCampaignGoalOf([record], [table])(record)?.goal;
  };
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
  assertStrictEquals(reportGoal(sales), "ecommerce");

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
  assertStrictEquals(reportGoal(engagement), "traffic");
});

Deno.test(
  "a lead campaign's results are its leads, however Meta reports them",
  () => {
    assertStrictEquals(
      goalResultCount({ link_clicks: 45, leads: 3 }, "leads"),
      3,
    );
    assertStrictEquals(
      goalResultCount({ conversations: 4, spend: 100 }, "leads"),
      4,
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
    // The report's goal: an engagement objective with no optimization goal and
    // no traffic type is a lead campaign there (facebookCampaignGoal), so the
    // pulse judges "מעורבות | סרטונים" by leads too.
    assertEquals(rows.map((row) => row.goal).sort(), [
      "ecommerce",
      "leads",
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
    assertStrictEquals(
      goalResultCount({ verified_leads: 0, conversions: 7 }, "leads"),
      7,
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

Deno.test(
  "an Instagram traffic campaign shows clicks, CTR and new followers",
  () => {
    const table = {
      id: "t-amy",
      client_id: "amy",
      integration_type: "facebook_insights",
      integration_settings: {},
    };
    const dates = [
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ];
    const records = dates.map((date, index) => ({
      table_id: table.id,
      data: {
        date,
        entity_level: "campaign",
        campaign_id: "ig-traffic",
        campaign_name: "קמפיין טראפיק לאינסטגרם",
        campaign_objective: "OUTCOME_TRAFFIC",
        optimization_goal: "PROFILE_VISIT",
        destination_type: "INSTAGRAM_PROFILE",
        spend: 100,
        impressions: 4000,
        link_clicks: 80,
        // The first day was synced before follows were stored.
        ...(index === 0 ? {} : { new_followers: 10 }),
      },
    }));
    const [row] = buildPulseCampaignRows({
      records,
      tables: [table],
      nowYmd: "2026-09-18",
    });
    assertStrictEquals(row.goal, "engagement");
    assertStrictEquals(row.impressions_7d, 28000);
    assertStrictEquals(row.clicks_7d, 560);
    assertStrictEquals(row.ctr_7d, 2);
    assertStrictEquals(row.new_followers_7d, 60);
  },
);

Deno.test("a campaign without synced follows has no follower count", () => {
  const [row] = buildPulseCampaignRows({
    records: [
      {
        table_id: "t1",
        data: {
          date: "2026-09-17",
          entity_level: "campaign",
          campaign_id: "web",
          campaign_name: "טראפיק לאתר",
          campaign_objective: "OUTCOME_TRAFFIC",
          spend: 50,
          impressions: 0,
          clicks: 30,
        },
      },
    ],
    tables: [
      { id: "t1", client_id: "c1", integration_type: "facebook_insights" },
    ],
    nowYmd: "2026-09-18",
  });
  assertStrictEquals(row.clicks_7d, 30);
  assertStrictEquals(row.ctr_7d, null);
  assertStrictEquals(row.new_followers_7d, null);
});

Deno.test(
  "a campaign in a leads-only table and an ecommerce table stays one campaign with one goal",
  () => {
    const tables = [
      {
        id: "meta-leads",
        client_id: "c1",
        integration_type: "facebook_insights",
        integration_settings: { campaign_type: "leads" },
      },
      {
        id: "meta-ecom",
        client_id: "c1",
        integration_type: "facebook_ecommerce",
        integration_settings: {},
      },
    ];
    const records = [];
    for (const date of ["2026-09-15", "2026-09-16", "2026-09-17"]) {
      for (const [table_id, spend] of [
        ["meta-leads", 30],
        ["meta-ecom", 40],
      ]) {
        records.push({
          table_id,
          data: {
            date,
            campaign_id: "77",
            campaign_name: "מכירות כפול",
            campaign_objective: "OUTCOME_SALES",
            spend,
            purchases: 0,
            leads: 0,
          },
        });
      }
    }
    const rows = buildPulseCampaignRows({
      records,
      tables,
      nowYmd: "2026-09-18",
    });
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0].goal, "ecommerce");
    assertStrictEquals(rows[0].alert_eligible, true);
  },
);
