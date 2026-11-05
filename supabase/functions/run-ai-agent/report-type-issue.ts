/**
 * Whether a Meta report's type fits what Meta spends on (AIO-238), for
 * verify_report_vs_meta.
 */
import { getSpendFromData } from "../_shared/campaign-goal/ads-metrics.ts";
import { reportCampaignKey } from "../_shared/campaign-goal/campaign-goals.ts";
import { facebookCampaignGoals } from "../_shared/campaign-goal/facebook-goal.ts";
import { isFacebookLeadsOnlyTable } from "../_shared/campaign-goal/facebook-type.ts";
import type { ReportCampaignGoal } from "../_shared/campaign-goal/report-goals.ts";
import { isEcommerceReportTable } from "../_shared/campaign-goal/table-goal.ts";
import { round2 } from "../_shared/reconcile/metrics.ts";

/** A Meta report table's type: leads only, ecommerce, or mixed (every goal). */
export type FacebookReportType = "leads" | "ecommerce" | "mixed";

/** A Meta campaign × day row, built like the stored report rows. */
type MetaRow = { data?: Record<string, unknown> | null };

/** The type of a Meta report table, by the table rules the reports use. */
export function facebookReportType(
  integrationType: string | null | undefined,
  integrationSettings: Record<string, unknown> | null = {},
): FacebookReportType {
  if (integrationType === "facebook_ecommerce") {
    return "ecommerce";
  }
  if (isFacebookLeadsOnlyTable(integrationSettings)) {
    return "leads";
  }
  return isEcommerceReportTable({
    integration_type: integrationType,
    integration_settings: integrationSettings,
  })
    ? "ecommerce"
    : "mixed";
}

/**
 * A leads-only report hides sales campaigns; an ecommerce report that is
 * mostly leads is mislabeled. Each campaign gets the goal a report showing
 * every goal gives it (facebookCampaignGoals, not leads-only), so the check
 * still sees the sales campaigns a leads-only table hides. Returns that issue
 * (Hebrew, for Carmen's answer, or null) and Meta's spend by report goal.
 */
export function reportTypeIssue(
  metaRows: Array<MetaRow> = [],
  reportType: FacebookReportType = "mixed",
): {
  typeIssue: string | null;
  metaSpend: number;
  spendByGoal: Record<ReportCampaignGoal, number>;
} {
  const spendByGoal = metaSpendByGoal(metaRows);
  const metaSpend =
    spendByGoal.ecommerce + spendByGoal.leads + spendByGoal.traffic;
  let typeIssue: string | null = null;
  if (reportType === "leads" && spendByGoal.ecommerce >= 5) {
    typeIssue = `הדוח מוגדר לידים בלבד אבל יש קמפייני מכירה במטא (₪${round2(spendByGoal.ecommerce)})`;
  } else if (
    reportType === "ecommerce" &&
    spendByGoal.leads > metaSpend * 0.5
  ) {
    typeIssue = `הדוח מוגדר איקומרס אבל רוב ההוצאה במטא על קמפייני לידים (₪${round2(spendByGoal.leads)})`;
  }
  return {
    typeIssue,
    metaSpend: round2(metaSpend),
    spendByGoal: {
      ecommerce: round2(spendByGoal.ecommerce),
      leads: round2(spendByGoal.leads),
      traffic: round2(spendByGoal.traffic),
    },
  };
}

/** Meta's spend summed by each row's campaign goal. */
function metaSpendByGoal(
  metaRows: Array<MetaRow>,
): Record<ReportCampaignGoal, number> {
  const goals = facebookCampaignGoals(metaRows, reportCampaignKey, {
    leadsOnly: false,
  });
  const spend: Record<ReportCampaignGoal, number> = {
    ecommerce: 0,
    leads: 0,
    traffic: 0,
  };
  for (const row of metaRows) {
    const data = row.data ?? {};
    const goal = goals.get(reportCampaignKey(data));
    if (goal) {
      spend[goal] += getSpendFromData(data);
    }
  }
  return spend;
}
