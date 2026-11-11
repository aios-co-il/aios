import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import {
  REPORT_CAMPAIGN_GOALS,
  reportCampaignGoalOf,
  type CampaignGoalRecord,
  type CampaignGoalTable,
} from "@/lib/campaignGoals";
import type { ReportScope } from "../metrics/reportMetricTypes";
import type { ReportChannel, ReportPeriod } from "./reportData";
import {
  accumulateAdsRow,
  finishScope,
  newScopeAccumulator,
  type GoalAdsRow,
  type ScopeAccumulator,
} from "./scopeAccumulator";
import { attachSite, siteContext } from "./siteFigures";

/** A period's dashboard records, the tables they belong to and the store's sales. */
export type ReportPeriodInput = {
  records: Array<CampaignGoalRecord>;
  tables: Array<CampaignGoalTable>;
  /** WooCommerce in the period (fetchWooDashboardSummary); null without a store. */
  woo: { revenue: number; orders: number } | null;
};

const CHANNEL_OF: Record<string, ReportChannel> = {
  facebook_insights: "facebook",
  facebook_ecommerce: "facebook",
  google_ads: "google_ads",
};

/**
 * A period of a dashboard by scope. Each campaign-level ads row goes to its
 * campaign's goal as its table's report classifies it (reportCampaignGoalOf);
 * Analytics' daily rows and the store (dashboardStore) join the scopes that
 * measure the site: every campaign, sales and traffic.
 */
export function buildReportPeriod(input: ReportPeriodInput): ReportPeriod {
  const adsRows = goalAdsRows(input);
  const accumulators = new Map<ReportScope, ScopeAccumulator>();
  for (const row of adsRows) {
    for (const scope of ["all", row.goal] as const) {
      const acc = accumulators.get(scope) ?? newScopeAccumulator();
      accumulateAdsRow(acc, row);
      accumulators.set(scope, acc);
    }
  }
  const all = accumulators.get("all") ?? newScopeAccumulator();
  const site = siteContext(input, all, accumulators.get("leads"));
  if (site.store && site.store.spend > 0 && !accumulators.has("ecommerce")) {
    accumulators.set("ecommerce", newScopeAccumulator());
  }
  const goals = REPORT_CAMPAIGN_GOALS.filter((goal) => accumulators.has(goal));
  const scopes: ReportPeriod["scopes"] = {};
  for (const scope of ["all", ...goals] as const) {
    const acc = accumulators.get(scope) ?? all;
    attachSite(acc, scope, site);
    scopes[scope] = finishScope(acc);
  }
  return { goals, scopes };
}

/** The campaign-level ads rows that have a goal, with their channel. */
function goalAdsRows(input: ReportPeriodInput): Array<GoalAdsRow> {
  const typeOf = new Map(input.tables.map((t) => [t.id, t.integration_type]));
  const records = input.records.filter((record) => {
    const type = typeOf.get(record.table_id) ?? "";
    return (
      type in CHANNEL_OF &&
      shouldIncludeInAdsDashboardAggregate(record.data, type)
    );
  });
  const goalOf = reportCampaignGoalOf(records, input.tables);
  return records.flatMap((record) => {
    const verdict = goalOf(record);
    const type = typeOf.get(record.table_id) ?? "";
    return verdict
      ? [
          {
            tableId: record.table_id,
            data: record.data ?? {},
            goal: verdict.goal,
            channel: CHANNEL_OF[type],
          },
        ]
      : [];
  });
}
