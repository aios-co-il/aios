import { campaignGoalOverride } from "./override.ts";
import { campaignNameGoal, legacyCampaignTypeGoal } from "./row-hints.ts";
import { isEcommerceReportTable, type GoalReportTable } from "./table-goal.ts";

/** What a Google Ads campaign is measured on: sales (ROAS) or leads (cost per lead). */
export type GoogleCampaignGoal = "ecommerce" | "leads";

type PulseGoal = GoogleCampaignGoal | "engagement";

/** Goals a hand-written override (`pulse_campaign_goals`) may set. */
const OVERRIDE_GOALS: ReadonlySet<string> = new Set([
  "leads",
  "engagement",
  "ecommerce",
]);

/** Signals parsed from a row and its table before the Google rules run. */
export type GoogleGoalHints = {
  /** Goal of the row's legacy `campaign_type`: Make/webhook rows carry the table type per row. */
  legacyGoal: PulseGoal | null;
  nameGoal: PulseGoal | null;
  reportIsEcommerce: boolean;
};

export type GoogleGoalClassification = {
  goal: PulseGoal;
  source: "platform_goal" | "explicit_mapping" | "table_report_type";
};

/**
 * One Google Ads daily row's goal vote, from its own fields and its report
 * table: a hand-written override first, then classifyGoogleCampaignGoal.
 */
export function classifyGoogleCampaignRow(
  data: Record<string, unknown>,
  table: GoalReportTable,
): GoogleGoalClassification {
  const override = campaignGoalOverride(data, table.integration_settings || {});
  if (isOverrideGoal(override)) {
    return { goal: override, source: "explicit_mapping" };
  }
  return classifyGoogleCampaignGoal(data, {
    legacyGoal: legacyCampaignTypeGoal(data.campaign_type),
    nameGoal: campaignNameGoal(data.campaign_name),
    reportIsEcommerce: isEcommerceReportTable(table),
  });
}

/**
 * Google Ads campaigns (Performance Max, Search, Shopping) have no objective.
 * The sync stamps `conversion_goal` from what each campaign converts on; without
 * it the report's own type decides. Conversion value or a clicks-only day never
 * does: lead accounts often give leads a value, and quiet days have no conversions.
 */
export function classifyGoogleCampaignGoal(
  data: Record<string, unknown>,
  hints: GoogleGoalHints,
): GoogleGoalClassification {
  const stamped = stampedConversionGoal(data.conversion_goal);
  if (stamped) {
    return { goal: stamped, source: "platform_goal" };
  }

  if (hints.legacyGoal === "ecommerce" || hints.legacyGoal === "leads") {
    return { goal: hints.legacyGoal, source: "explicit_mapping" };
  }
  // Legacy rows carry `purchases` only on ecommerce tables.
  if (data.purchases !== undefined && data.purchases !== null) {
    return { goal: "ecommerce", source: "explicit_mapping" };
  }

  if (isShoppingChannel(data.campaign_channel_type)) {
    return { goal: "ecommerce", source: "platform_goal" };
  }

  if (hints.nameGoal) {
    return { goal: hints.nameGoal, source: "explicit_mapping" };
  }

  return {
    goal: hints.reportIsEcommerce ? "ecommerce" : "leads",
    source: "table_report_type",
  };
}

/** The goal the sync stamped on the row, when it is one of the two Google goals. */
function stampedConversionGoal(value: unknown): GoogleCampaignGoal | null {
  const goal = typeof value === "string" ? value.trim().toLowerCase() : "";
  return goal === "ecommerce" || goal === "leads" ? goal : null;
}

/** Shopping campaigns only sell products. */
function isShoppingChannel(value: unknown): boolean {
  return typeof value === "string" && value.toUpperCase() === "SHOPPING";
}

/** Whether a hand-written override names a goal the pulse knows. */
function isOverrideGoal(goal: string): goal is PulseGoal {
  return OVERRIDE_GOALS.has(goal);
}
