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
  id?: string;
  campaign_active?: boolean | null;
};

type GoalRecord = { table_id?: string; data?: Record<string, unknown> | null };

/**
 * The goals of the client's campaigns that spent since `sinceYmd`, plus the
 * own goal of each active table none of whose lead or sales campaigns spent
 * then. So a
 * plain Meta table running sales campaigns makes the client ecommerce, and a
 * table whose sync died keeps its goal, so its missing data still raises
 * the stale-sync flag. Hybrid with both goals, ecommerce with sales only,
 * leads otherwise.
 */
export function clientGoalModeOf<T extends GoalRecord>(input: {
  records: Array<T>;
  goalOf: (record: T) => ReportCampaignGoal | undefined;
  tables: Array<ClientGoalTable>;
  sinceYmd: string;
}): ClientGoalMode {
  const goals = new Set<ReportCampaignGoal>();
  const spendingTables = new Set<string>();
  for (const record of input.records) {
    const date = String(record.data?.date ?? "");
    if (date < input.sinceYmd || getSpendFromData(record.data) <= 0) {
      continue;
    }
    const goal = input.goalOf(record);
    if (goal) {
      goals.add(goal);
    }
    // Only a lead or sales campaign decides its table's goal: a table that
    // spends on exposure campaigns alone keeps its own goal (AIO-496).
    if (record.table_id && (goal === "leads" || goal === "ecommerce")) {
      spendingTables.add(record.table_id);
    }
  }
  for (const table of input.tables) {
    if (table.campaign_active === false || spendingTables.has(table.id ?? "")) {
      continue;
    }
    const goal = reportTableGoal(table);
    if (goal) {
      goals.add(goal);
    }
  }
  if (goals.has("leads") && goals.has("ecommerce")) {
    return "hybrid";
  }
  return goals.has("ecommerce") ? "ecommerce" : "leads";
}
