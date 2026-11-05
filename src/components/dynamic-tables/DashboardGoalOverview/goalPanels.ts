import {
  REPORT_CAMPAIGN_GOALS,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import {
  goalCpl,
  unvaluedPurchaseCost,
  type DashboardCombinedSales,
} from "@/lib/dashboardCombinedFigures";
import type { DashboardGoalSummary } from "@/lib/dashboardGoalSummary";
import type { GoogleAdsFormatters } from "../GoogleAdsCampaignSection/types";
import type { PlatformLabelOf } from "../DashboardPlatformBreakdown/BreakdownCells";

/** One labelled figure of a summary card, already formatted. */
export type GoalFigure = { label: string; value: string };

/** One goal's panel: its figures and an optional line under them. */
export type GoalPanel = {
  goal: ReportCampaignGoal;
  figures: GoalFigure[];
  note: string | null;
};

type PanelInput = {
  summary: DashboardGoalSummary;
  sales: DashboardCombinedSales;
  leads: { leads: number; cpl: number };
  platformLabel: PlatformLabelOf;
  format: GoogleAdsFormatters;
};

/** A panel per goal that has campaigns, in report order. */
export function goalPanels(input: PanelInput): GoalPanel[] {
  const present = new Set(input.summary.rows.map((row) => row.goal));
  return REPORT_CAMPAIGN_GOALS.filter((goal) => present.has(goal)).map((goal) =>
    PANELS[goal](input),
  );
}

const PANELS: Record<ReportCampaignGoal, (input: PanelInput) => GoalPanel> = {
  ecommerce: salesPanel,
  leads: leadsPanel,
  traffic: trafficPanel,
};

/**
 * Spend, purchases and ROAS; cost per purchase instead of ROAS when the
 * purchases carry no value. The revenue goes under the figures.
 */
function salesPanel({ summary, sales, format }: PanelInput): GoalPanel {
  const purchaseCost = unvaluedPurchaseCost(sales);
  const measure: GoalFigure =
    purchaseCost !== null
      ? { label: "עלות לרכישה", value: format.formatCurrency(purchaseCost) }
      : {
          label: "ROAS",
          value: sales.roas === null ? "-" : sales.roas.toFixed(2),
        };
  return {
    goal: "ecommerce",
    figures: [
      {
        label: "הוצאה",
        value: format.formatCurrency(summary.goals.ecommerce.spend),
      },
      { label: "רכישות", value: format.formatNumber(sales.purchases) },
      measure,
    ],
    note:
      sales.revenue > 0
        ? `הכנסות: ${format.formatCurrency(sales.revenue)}`
        : null,
  };
}

/**
 * Spend, leads and cost per lead; when leads come from several platforms,
 * each platform's cost per lead under the figures.
 */
function leadsPanel({
  summary,
  leads,
  platformLabel,
  format,
}: PanelInput): GoalPanel {
  const leadRows = summary.rows.filter((row) => row.goal === "leads");
  const perPlatform = leadRows
    .filter((row) => row.metrics.leads > 0)
    .map(
      (row) =>
        `${platformLabel(row.platform).name} ${format.formatCurrency(goalCpl(row.metrics))}`,
    );
  return {
    goal: "leads",
    figures: [
      {
        label: "הוצאה",
        value: format.formatCurrency(summary.goals.leads.spend),
      },
      { label: "לידים", value: format.formatNumber(leads.leads) },
      {
        label: "עלות לליד",
        value: leads.cpl > 0 ? format.formatCurrency(leads.cpl) : "-",
      },
    ],
    note:
      perPlatform.length > 1
        ? `לפי פלטפורמה: ${perPlatform.join(" · ")}`
        : null,
  };
}

/** Spend, clicks and cost per click. */
function trafficPanel({ summary, format }: PanelInput): GoalPanel {
  const traffic = summary.goals.traffic;
  return {
    goal: "traffic",
    figures: [
      { label: "הוצאה", value: format.formatCurrency(traffic.spend) },
      { label: "קליקים", value: format.formatNumber(traffic.clicks) },
      {
        label: "עלות לקליק",
        value:
          traffic.clicks > 0
            ? format.formatUnitCost(traffic.spend / traffic.clicks)
            : "-",
      },
    ],
    note: null,
  };
}
