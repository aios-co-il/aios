import { describe, expect, it } from "vitest";
import { groupFacebookReportCampaigns } from "@/components/dynamic-tables/facebookReportCampaigns";
import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import { dashboardGoalTotals } from "@/hooks/useDashboardGoalTotals";
import { isFacebookLeadsOnlyTable } from "@/lib/adsMetrics";
import {
  REPORT_CAMPAIGN_GOALS,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import {
  dashboardFacebookCampaigns,
  dashboardRecordGoalOf,
  dashboardRecordLeads,
  type DashboardAdsRecord,
} from "./dashboardCampaignGoals";
import {
  CLIENTS,
  RECORDS,
  TABLES,
  dashboardRecords,
} from "./dashboardGoalParityFixtures";

/** A campaign as a page shows it: its goal and its result count. */
type Verdict = { goal: ReportCampaignGoal; results: number | null };

const resultsOf = (
  goal: ReportCampaignGoal,
  campaign: { purchases: number; leads: number },
) =>
  goal === "ecommerce"
    ? campaign.purchases
    : goal === "leads"
      ? campaign.leads
      : null;

/**
 * Each campaign's goal and results as its own table's report shows them, by
 * the rule reportCampaignGoalOf and the pulse use. The internal report's
 * legacy single-table Facebook Ecommerce view still lists every campaign
 * under sales.
 */
function reportVerdicts(clientId: string): Map<string, Verdict> {
  const verdicts = new Map<string, Verdict>();
  for (const table of TABLES.filter((t) => t.client_id === clientId)) {
    const rows = RECORDS.filter((row) => row.table_id === table.id);
    if (table.integration_type === "google_ads") {
      for (const campaign of summarizeGoogleAdsCampaigns(rows, [table])
        .campaigns) {
        verdicts.set(campaign.name, {
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
      for (const [, campaign] of groups[goal]) {
        verdicts.set(campaign.name, {
          goal,
          results: resultsOf(goal, campaign),
        });
      }
    }
  }
  return verdicts;
}

/** Each campaign's goal and results as the client's dashboard shows them. */
function dashboardVerdicts(clientId: string): Map<string, Verdict> {
  const records = dashboardRecords(clientId);
  const tables = TABLES.filter((table) => table.client_id === clientId);
  const goalOf = dashboardRecordGoalOf(records, tables);
  const facebook = dashboardFacebookCampaigns(records, goalOf);
  const verdicts = new Map<string, Verdict>();
  for (const goal of REPORT_CAMPAIGN_GOALS) {
    for (const campaign of facebook[goal]) {
      verdicts.set(campaign.name, { goal, results: resultsOf(goal, campaign) });
    }
  }
  const google = records.filter((record) => record._source === "google_ads");
  for (const campaign of summarizeGoogleAdsCampaigns(google, tables)
    .campaigns) {
    verdicts.set(campaign.name, {
      goal: campaign.goal,
      results: campaign.conversions,
    });
    // Each Google row takes its campaign's goal on the dashboard too.
    for (const record of google) {
      if (record.data?.campaign_name === campaign.name) {
        expect(goalOf(record)).toBe(campaign.goal);
      }
    }
  }
  return verdicts;
}

describe("the dashboards show each campaign as its report does", () => {
  it.each(CLIENTS)("client %s: same goal and result count", (clientId) => {
    const report = reportVerdicts(clientId);
    expect(report.size).toBeGreaterThan(0);
    expect(Object.fromEntries(dashboardVerdicts(clientId))).toEqual(
      Object.fromEntries(report),
    );
  });

  it("covers sales, leads and traffic on Meta and Google", () => {
    const goals = new Set(
      CLIENTS.flatMap((clientId) =>
        [...dashboardVerdicts(clientId).values()].map((v) => v.goal),
      ),
    );
    expect([...goals].sort()).toEqual(["ecommerce", "leads", "traffic"]);
  });
});

describe("dashboard behaviour that now follows the report", () => {
  const verdicts = (clientId: string) =>
    Object.fromEntries(dashboardVerdicts(clientId));

  it("a Facebook Ecommerce table's campaign without a sales signal is a lead campaign", () => {
    // Before: every campaign not typed lead or traffic went to sales.
    expect(verdicts("fb-ecom")).toEqual({
      "מכירות אוגוסט": { goal: "ecommerce", results: 18 },
      "לידים דרושים": { goal: "leads", results: 108 },
      "תנועה אוגוסט": { goal: "traffic", results: null },
      "מודעות פתחנו": { goal: "leads", results: 9 },
    });
  });

  it("a leads-only table keeps its own campaigns in leads, not another account's", () => {
    // Before: one leads-only Facebook table put every Facebook table in leads.
    expect(verdicts("two-accounts")).toEqual({
      "מכירות בטבלת לידים": { goal: "leads", results: 6 },
      "מכירות בחשבון השני": { goal: "ecommerce", results: 9 },
    });
  });

  it("a campaign set to add to cart is a sales campaign, as in the report", () => {
    expect(verdicts("mixed")["עגלה"]).toEqual({
      goal: "ecommerce",
      results: 0,
    });
  });

  it("two same-name campaigns with different goals keep their own tables", () => {
    // Before: rows were classified by campaign name, so both took one goal.
    const records: Array<DashboardAdsRecord> = [
      {
        campaign_id: "c-sale",
        campaign_objective: "OUTCOME_SALES",
        spend: 100,
        purchases: 2,
      },
      {
        campaign_id: "c-lead",
        campaign_objective: "OUTCOME_LEADS",
        spend: 50,
        leads: 5,
      },
    ].map((data) => ({
      _source: "facebook_insights",
      _tableId: "fb",
      data: {
        date: "2026-11-02",
        entity_level: "campaign",
        campaign_name: "קמפיין",
        ...data,
      },
    }));
    const tables = [
      {
        id: "fb",
        integration_type: "facebook_insights",
        integration_settings: {},
      },
    ];
    const groups = dashboardFacebookCampaigns(
      records,
      dashboardRecordGoalOf(records, tables),
    );
    expect(groups.ecommerce.map((c) => [c.name, c.purchases])).toEqual([
      ["קמפיין", 2],
    ]);
    expect(groups.leads.map((c) => [c.name, c.leads])).toEqual([["קמפיין", 5]]);
    expect(groups.all).toHaveLength(1);
  });
});

describe("dashboardRecordLeads", () => {
  it("adds up to the leads KPI: lead campaigns only, never Google sales conversions", () => {
    for (const clientId of CLIENTS) {
      const records = dashboardRecords(clientId);
      const tables = TABLES.filter((table) => table.client_id === clientId);
      const goalOf = dashboardRecordGoalOf(records, tables);
      const daily = records.reduce(
        (sum, record) => sum + dashboardRecordLeads(record, goalOf),
        0,
      );
      const totals = dashboardGoalTotals({
        showAll: true,
        facebook: dashboardFacebookCampaigns(records, goalOf),
        records,
        tables,
        woo: { revenue: 0, orders: 0 },
      });
      expect(daily).toBe(totals.combinedLeads.leads);
    }
  });

  it("counts a Google lead campaign's conversions and not a PMax sales campaign's", () => {
    const records = dashboardRecords("google-leads");
    const goalOf = dashboardRecordGoalOf(
      records,
      TABLES.filter((table) => table.client_id === "google-leads"),
    );
    const leadsOf = (name: string) =>
      records
        .filter((record) => record.data?.campaign_name === name)
        .reduce((sum, record) => sum + dashboardRecordLeads(record, goalOf), 0);
    // Before: the daily leads chart summed every ads row's conversions.
    expect(leadsOf("חיפוש")).toBe(6);
    expect(leadsOf("PMax")).toBe(0);
  });

  it("gives non-ads records no goal and no leads", () => {
    const record = {
      _source: "google_analytics",
      _tableId: "ga",
      data: { date: "2026-11-02", report_type: "daily", conversions: 4 },
    };
    const goalOf = dashboardRecordGoalOf([record], []);
    expect(goalOf(record)).toBeNull();
    expect(dashboardRecordLeads(record, goalOf)).toBe(0);
  });

  it("reads a share link's records, with their public settings, the same way", () => {
    for (const clientId of CLIENTS) {
      const internal = dashboardRecords(clientId);
      const shared = internal.map((record) => ({
        ...record,
        _integrationSettings: TABLES.find((t) => t.id === record._tableId)
          ?.integration_settings,
      }));
      const tables = TABLES.filter((table) => table.client_id === clientId);
      const goalOf = dashboardRecordGoalOf(internal, tables);
      const sharedGoalOf = dashboardRecordGoalOf(shared, tables);
      expect(shared.map(sharedGoalOf)).toEqual(internal.map(goalOf));
    }
  });
});
