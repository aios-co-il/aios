/**
 * A client's goal mode: which goals its running campaigns have in their
 * reports. The pulse snapshot (`campaign_goal_mode`, `is_ecommerce`) and
 * Carmen's analyze_campaign_performance both read it, so they agree (AIO-494).
 */
import { getSpendFromData } from "./ads-metrics.ts";
import type { ReportCampaignGoal } from "./report-goals.ts";
import { reportTableGoal, type GoalReportTable } from "./table-goal.ts";

export type ClientGoalMode = "leads" | "ecommerce" | "hybrid";

/** A report table with its on/off switch; a switched-off table does not count. */
export type ClientGoalTable = GoalReportTable & {
  campaign_active?: boolean | null;
};

type GoalRecord = { data?: Record<string, unknown> | null };

/**
 * Hybrid when lead and sales campaigns spent since `sinceYmd`, ecommerce when
 * only sales campaigns did, leads otherwise. A client whose campaigns did not
 * spend in the window takes its active report tables' own goals instead.
 */
export function clientGoalModeOf<T extends GoalRecord>(input: {
  records: Array<T>;
  goalOf: (record: T) => ReportCampaignGoal | undefined;
  tables: Array<ClientGoalTable>;
  sinceYmd: string;
}): ClientGoalMode {
  const goals = new Set<ReportCampaignGoal>();
  for (const record of input.records) {
    const date = String(record.data?.date ?? "");
    if (date >= input.sinceYmd && getSpendFromData(record.data) > 0) {
      const goal = input.goalOf(record);
      if (goal) {
        goals.add(goal);
      }
    }
  }
  if (!goals.has("leads") && !goals.has("ecommerce")) {
    for (const table of input.tables) {
      const goal =
        table.campaign_active === false ? null : reportTableGoal(table);
      if (goal) {
        goals.add(goal);
      }
    }
  }
  if (goals.has("leads") && goals.has("ecommerce")) {
    return "hybrid";
  }
  return goals.has("ecommerce") ? "ecommerce" : "leads";
}
