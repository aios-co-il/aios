import { describe, expect, it } from "vitest";
import { groupFacebookReportCampaigns } from "@/components/dynamic-tables/facebookReportCampaigns";
import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import { isFacebookLeadsOnlyTable } from "@/lib/adsMetrics";
import { pulseTrendWindows } from "@/lib/pulseCampaignGoals";
import { reportCampaignGoalOf } from "../../supabase/functions/_shared/campaign-goal/campaign-goals.ts";
import { computeGoalMetricsFromRecords } from "../../supabase/functions/_shared/campaign-pulse.ts";
import { TODAY } from "../../supabase/functions/_shared/pulse/report-goal-fixtures.ts";
import { RECORDS, type Row, TABLES } from "./pulseReportParityFixtures";

/** A client's 7-day spend, results and revenue for one goal. */
type GoalTotals = { spend: number; outcomes: number; revenue: number };

const CURRENT_7 = pulseTrendWindows(TODAY).current7;
const IN_CURRENT_7 = (row: Row) =>
  String(row.data.date) >= CURRENT_7.start &&
  String(row.data.date) <= CURRENT_7.end;
const CLIENT_GOALS = ["ecommerce", "leads"] as const;
const cents = (value: number) => Math.round(value * 100) / 100;

/** Each client's per-goal totals as its reports' sales and lead tables add them up. */
function reportClientTotals(): Map<string, GoalTotals> {
  const totals = new Map<string, GoalTotals>();
  const add = (key: string, spend: number, outcomes: number, revenue = 0) => {
    const current = totals.get(key) ?? { spend: 0, outcomes: 0, revenue: 0 };
    totals.set(key, {
      spend: cents(current.spend + spend),
      outcomes: cents(current.outcomes + outcomes),
      revenue: cents(current.revenue + revenue),
    });
  };
  for (const table of TABLES) {
    const rows = RECORDS.filter(
      (row) => row.table_id === table.id && IN_CURRENT_7(row),
    );
    if (table.integration_type === "google_ads") {
      for (const campaign of summarizeGoogleAdsCampaigns(rows, [table])
        .campaigns) {
        add(
          `${table.client_id}:${campaign.goal}`,
          campaign.spend,
          campaign.conversions,
          campaign.goal === "ecommerce" ? campaign.conversions_value : 0,
        );
      }
      continue;
    }
    const groups = groupFacebookReportCampaigns(rows, "campaign", {
      leadsOnly: isFacebookLeadsOnlyTable(table.integration_settings),
    });
    for (const [, campaign] of groups.ecommerce) {
      add(
        `${table.client_id}:ecommerce`,
        campaign.spend,
        campaign.purchases,
        campaign.purchase_value,
      );
    }
    for (const [, campaign] of groups.leads) {
      add(`${table.client_id}:leads`, campaign.spend, campaign.leads);
    }
  }
  return totals;
}

/** Each client's per-goal totals as the snapshot computes them (computeGoalMetricsFromRecords). */
function pulseClientTotals(): Map<string, GoalTotals> {
  const totals = new Map<string, GoalTotals>();
  for (const clientId of new Set(TABLES.map((table) => table.client_id))) {
    const tables = TABLES.filter((table) => table.client_id === clientId);
    const tableIds = new Set(tables.map((table) => table.id));
    const records = RECORDS.filter(
      (row) => tableIds.has(row.table_id) && IN_CURRENT_7(row),
    );
    // The snapshot's records per goal: each record goes with its campaign's report goal.
    const verdictOf = reportCampaignGoalOf(records, tables);
    for (const goal of CLIENT_GOALS) {
      const goalRecords = records.filter(
        (row) => verdictOf(row)?.goal === goal,
      );
      if (!goalRecords.length) {
        continue;
      }
      const metrics = computeGoalMetricsFromRecords(
        goalRecords,
        goal,
        CURRENT_7.start,
        CURRENT_7.start,
      );
      totals.set(`${clientId}:${goal}`, {
        spend: metrics.spend,
        outcomes: metrics.outcomes,
        revenue: metrics.revenue,
      });
    }
  }
  return totals;
}

describe("the pulse's client-level totals are the report's", () => {
  it("adds up the same spend, results and revenue per client and goal", () => {
    const report = reportClientTotals();
    expect(report.size).toBeGreaterThanOrEqual(8);
    expect(Object.fromEntries(pulseClientTotals())).toEqual(
      Object.fromEntries(report),
    );
  });
});
