/**
 * What a client's report totals over some campaign rows, each row counted by
 * its campaign's report goal, for analyze_campaign_performance.
 */
import { getSpendFromData } from "../_shared/campaign-goal/ads-metrics.ts";
import type {
  CampaignGoalRecord,
  CampaignGoalVerdict,
} from "../_shared/campaign-goal/campaign-goals.ts";
import { adsRowOutcomes } from "../_shared/campaign-goal/outcomes.ts";

/**
 * What the reports total over some rows. Leads come only from lead campaigns
 * and purchases and revenue only from sales campaigns; CPL and ROAS use only
 * those campaigns' spend. A row of a table with no report goal (neither Meta
 * nor Google Ads) counts everything, as adsRowOutcomes counts a row without a
 * goal.
 */
export type ReportWindowTotals = {
  spend: number;
  leadSpend: number;
  ecommerceSpend: number;
  leads: number;
  purchases: number;
  revenue: number;
};

type VerdictOf = (record: CampaignGoalRecord) => CampaignGoalVerdict | null;

/** Totals of `records`, each counted by its campaign's report goal. */
export function reportWindowTotals(
  records: Array<CampaignGoalRecord>,
  verdictOf: VerdictOf,
): ReportWindowTotals {
  const totals: ReportWindowTotals = {
    spend: 0,
    leadSpend: 0,
    ecommerceSpend: 0,
    leads: 0,
    purchases: 0,
    revenue: 0,
  };
  for (const record of records) {
    const data = record.data ?? {};
    const goal = verdictOf(record)?.goal;
    const spend = getSpendFromData(data);
    const outcomes = adsRowOutcomes(data, goal);
    totals.spend += spend;
    if (goal === undefined || goal === "leads") {
      totals.leadSpend += spend;
    }
    if (goal === undefined || goal === "ecommerce") {
      totals.ecommerceSpend += spend;
    }
    totals.leads += outcomes.leads;
    totals.purchases += outcomes.purchases;
    totals.revenue += outcomes.revenue;
  }
  return totals;
}
