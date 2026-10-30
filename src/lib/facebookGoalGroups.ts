import {
  aggregateFacebookRecordsAtLevel,
  getEntityGroupKey,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";
import {
  facebookCampaignKey,
  type FacebookCampaignRow,
} from "@/lib/adsMetrics";
import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import { facebookCampaignGoals } from "@/lib/facebookCampaignGoal";

type RecordData = Record<string, unknown>;

/** The goal of a record's campaign (or ad set / ad). */
export type FacebookRecordGoalOf = (data: RecordData) => ReportCampaignGoal;

/**
 * Facebook Insights rows split into sales, lead and traffic tables by the
 * classifier the internal report and the weekly tab use, plus the goal of each
 * record for the KPIs. The shared report and both dashboards' mixed tables use
 * it. A leads-only table keeps every non-traffic campaign in leads.
 */
export function groupFacebookRowsByGoal(
  records: Array<{ data?: RecordData | null }>,
  level: AdsEntityLevel,
  options: { leadsOnly: boolean },
): Record<ReportCampaignGoal, FacebookCampaignRow[]> & {
  goalOf: FacebookRecordGoalOf;
} {
  const goalOf = facebookRecordGoalOf(records, level, options);
  const rowsOf = (goal: ReportCampaignGoal) =>
    aggregateFacebookRecordsAtLevel(
      records.filter((record) => goalOf(record.data ?? {}) === goal),
      level,
    );
  return {
    ecommerce: rowsOf("ecommerce"),
    leads: rowsOf("leads"),
    traffic: rowsOf("traffic"),
    goalOf,
  };
}

/**
 * The goal of each record's campaign (or ad set / ad) over all its records,
 * keyed the way aggregateFacebookRecordsAtLevel groups rows at this level. The
 * dashboards' KPIs read it so each campaign counts toward the goal of its table.
 */
export function facebookRecordGoalOf(
  records: Array<{ data?: RecordData | null }>,
  level: AdsEntityLevel,
  options: { leadsOnly: boolean },
): FacebookRecordGoalOf {
  const keyOf = (data: RecordData) => facebookEntityKey(data, level);
  const goals = facebookCampaignGoals(records, keyOf, options);
  return (data) => goals.get(keyOf(data)) ?? "leads";
}

/** The key aggregateFacebookRecordsAtLevel groups a record under at this level. */
function facebookEntityKey(data: RecordData, level: AdsEntityLevel): string {
  return level === "campaign"
    ? facebookCampaignKey(data)
    : getEntityGroupKey(data, level);
}
