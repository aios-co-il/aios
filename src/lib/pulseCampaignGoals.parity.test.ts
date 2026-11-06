import { describe, expect, it } from "vitest";
import { groupFacebookReportCampaigns } from "@/components/dynamic-tables/facebookReportCampaigns";
import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import { isFacebookLeadsOnlyTable } from "@/lib/adsMetrics";
import { REPORT_CAMPAIGN_GOALS } from "@/lib/campaignGoals";
import { buildPulseCampaignRows } from "@/lib/pulseCampaignGoals";
import { TODAY } from "../../supabase/functions/_shared/pulse/report-goal-fixtures.ts";
import { RECORDS, TABLES } from "./pulseReportParityFixtures";

/** A campaign as a report or the pulse shows it: its goal and its results. */
type Verdict = { goal: string; results: number | null };

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
