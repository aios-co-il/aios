import { describe, expect, it } from "vitest";
import { groupFacebookReportCampaigns } from "@/components/dynamic-tables/facebookReportCampaigns";
import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import { isFacebookLeadsOnlyTable } from "@/lib/adsMetrics";
import { REPORT_CAMPAIGN_GOALS } from "@/lib/campaignGoals";
import { buildPulseCampaignRows } from "@/lib/pulseCampaignGoals";
import {
  REPORT_GOAL_TABLES,
  TODAY,
  TODAY_RECORDS,
} from "../../supabase/functions/_shared/pulse/report-goal-fixtures.ts";

type Row = { table_id: string; data: Record<string, unknown> };
type Table = (typeof REPORT_GOAL_TABLES)[number];

/** A campaign as a report or the pulse shows it: its goal and its results. */
type Verdict = { goal: string; results: number | null };

const FULL_DAYS = (row: Row) => String(row.data.date) < TODAY;

/** One more report table with its campaign rows on the 7 full days. */
function extra(table: Table, campaigns: Array<Record<string, unknown>>) {
  const days = ["2026-10-30", "2026-11-02", "2026-11-05"];
  const rows = campaigns.flatMap((campaign) =>
    days.map((date) => ({
      table_id: table.id,
      data: { date, entity_level: "campaign", ...campaign },
    })),
  );
  return { table, rows };
}

const MIXED = extra(
  {
    id: "t-mixed",
    client_id: "mixed",
    integration_type: "facebook_insights",
    integration_settings: {},
    category: "Facebook Insights",
  },
  [
    {
      campaign_id: "m-sale",
      campaign_name: "מכירות",
      campaign_objective: "OUTCOME_SALES",
      optimization_goal: "OFFSITE_CONVERSIONS",
      spend: 50,
      purchases: 2,
      leads: 1,
    },
    {
      campaign_id: "m-wa",
      campaign_name: "ווטסאפ",
      campaign_objective: "OUTCOME_ENGAGEMENT",
      optimization_goal: "CONVERSATIONS",
      spend: 30,
      conversations: 4,
      leads: 0,
    },
    {
      campaign_id: "m-form",
      campaign_name: "טופס",
      campaign_objective: "OUTCOME_LEADS",
      optimization_goal: "LEAD_GENERATION",
      spend: 20,
      form_leads: 3,
      leads: 0,
    },
    {
      campaign_id: "m-video",
      campaign_name: "סרטונים",
      campaign_objective: "OUTCOME_ENGAGEMENT",
      optimization_goal: "THRUPLAY",
      spend: 10,
      video_views: 90,
      conversations: 0,
    },
    {
      campaign_id: "m-legacy",
      campaign_name: "ישן",
      campaign_type: "lead",
      spend: 15,
      leads: 2,
    },
  ],
);

const LEADS_ONLY = extra(
  {
    id: "t-leads-only",
    client_id: "leads-only",
    integration_type: "facebook_insights",
    integration_settings: { campaign_type: "leads" },
    category: "Facebook Insights",
  },
  [
    {
      campaign_id: "lo-sale",
      campaign_name: "מכירות בטבלת לידים",
      campaign_objective: "OUTCOME_SALES",
      spend: 40,
      purchases: 1,
      leads: 2,
    },
  ],
);

const GOOGLE_LEADS = extra(
  {
    id: "t-google-leads",
    client_id: "google-leads",
    integration_type: "google_ads",
    integration_settings: { campaign_type: "leads" },
    category: "Google Ads",
  },
  [
    {
      campaign_id: "g-search",
      campaign_name: "חיפוש",
      cost: 60,
      conversions: 2,
      conversions_value: 2,
    },
    {
      campaign_id: "g-pmax",
      campaign_name: "PMax",
      conversion_goal: "ecommerce",
      cost: 90,
      conversions: 1,
      conversions_value: 400,
    },
    {
      campaign_id: "g-video",
      campaign_name: "סרטון יוטיוב",
      cost: 25,
      conversions: 0,
    },
  ],
);

const TABLES: Array<Table> = [
  ...REPORT_GOAL_TABLES,
  MIXED.table,
  LEADS_ONLY.table,
  GOOGLE_LEADS.table,
];
const RECORDS: Array<Row> = [
  ...TODAY_RECORDS.filter(FULL_DAYS),
  ...MIXED.rows,
  ...LEADS_ONLY.rows,
  ...GOOGLE_LEADS.rows,
];

/** Each campaign's goal and results as its table's report shows them. */
function reportVerdicts(): Map<string, Verdict> {
  const verdicts = new Map<string, Verdict>();
  for (const table of TABLES) {
    const rows = RECORDS.filter((row) => row.table_id === table.id);
    if (table.integration_type === "google_ads") {
      for (const campaign of summarizeGoogleAdsCampaigns(rows, [table])
        .campaigns) {
        verdicts.set(campaign.campaign_id, {
          goal: campaign.goal,
          results: campaign.conversions,
        });
      }
      continue;
    }
    const groups = groupFacebookReportCampaigns(rows, "campaign", {
      leadsOnly: isFacebookLeadsOnlyTable(table.integration_settings),
    });
    for (const goal of REPORT_CAMPAIGN_GOALS) {
      for (const [key, campaign] of groups[goal]) {
        const results =
          goal === "ecommerce"
            ? campaign.purchases
            : goal === "leads"
              ? campaign.leads
              : null;
        verdicts.set(key, { goal, results });
      }
    }
  }
  return verdicts;
}

/** Each campaign's goal and 7-day results as the pulse judges them. */
function pulseVerdicts(): Map<string, Verdict> {
  const rows = buildPulseCampaignRows({
    records: RECORDS,
    tables: TABLES,
    nowYmd: TODAY,
  });
  return new Map(
    rows.map((row) => [
      String(row.campaign_id),
      {
        goal: row.goal === "engagement" ? "traffic" : row.goal,
        results: row.outcomes_7d,
      },
    ]),
  );
}

describe("the pulse judges each campaign as the report shows it", () => {
  it("gives every Meta and Google campaign the report's goal and result count", () => {
    const report = reportVerdicts();
    expect(report.size).toBe(21);
    expect(Object.fromEntries(pulseVerdicts())).toEqual(
      Object.fromEntries(report),
    );
  });

  it("covers sales, leads, traffic, PMax and mixed accounts", () => {
    const goals = new Set([...reportVerdicts().values()].map((v) => v.goal));
    expect([...goals].sort()).toEqual(["ecommerce", "leads", "traffic"]);
  });
});
