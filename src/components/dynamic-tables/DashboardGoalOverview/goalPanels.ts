import {
  REPORT_CAMPAIGN_GOALS,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import {
  goalCpl,
  unvaluedPurchaseCost,
  type DashboardCombinedSales,
} from "@/lib/dashboardCombinedFigures";
import type { DashboardCurrencies } from "@/lib/dashboardCurrencies";
import { moneyFormatters } from "@/lib/dashboardCurrencies";
import {
  formatGoalMoney,
  formatSplitSalesMeasure,
  goalRowCurrency,
  goalRowsMoney,
  goalSalesMoney,
  type GoalMoneyPart,
} from "@/lib/dashboardGoalMoney";
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
  /** Each platform in its own currency; a goal's totals never add currencies. */
  currencies: DashboardCurrencies;
  /** Whether the sales are the store's (dashboardStore). */
  hasStore: boolean;
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
function salesPanel(input: PanelInput): GoalPanel {
  const { summary, sales, format } = input;
  const money = goalSalesMoney(summary, input.hasStore, input.currencies);
  const purchaseCost = unvaluedPurchaseCost(sales);
  const label = purchaseCost !== null ? "עלות לרכישה" : "ROAS";
  const measure: GoalFigure =
    money.split || money.unmeasurable
      ? { label, value: formatSplitSalesMeasure(money, purchaseCost !== null) }
      : purchaseCost !== null
        ? { label, value: format.formatCurrency(purchaseCost) }
        : { label, value: sales.roas === null ? "-" : sales.roas.toFixed(2) };
  const revenue = money.split
    ? formatGoalMoney(money.split, (m) => m.revenue)
    : format.formatCurrency(sales.revenue);
  return {
    goal: "ecommerce",
    figures: [
      {
        label: "הוצאה",
        value: goalSpend(
          input,
          goalRowsMoney(summary, "ecommerce", input.currencies),
          "ecommerce",
        ),
      },
      { label: "רכישות", value: format.formatNumber(sales.purchases) },
      measure,
    ],
    note: sales.revenue > 0 ? `הכנסות: ${revenue}` : null,
  };
}

/**
 * Spend, leads and cost per lead; when leads come from several platforms,
 * each platform's cost per lead under the figures.
 */
function leadsPanel(input: PanelInput): GoalPanel {
  const { summary, leads, platformLabel, format, currencies } = input;
  const leadRows = summary.rows.filter((row) => row.goal === "leads");
  const perPlatform = leadRows
    .filter((row) => row.metrics.leads > 0)
    .map((row) => {
      const own = currencies.mixed
        ? moneyFormatters(goalRowCurrency(row.platform, currencies))
        : format;
      return `${platformLabel(row.platform).name} ${own.formatCurrency(goalCpl(row.metrics))}`;
    });
  const parts = goalRowsMoney(summary, "leads", currencies);
  return {
    goal: "leads",
    figures: [
      { label: "הוצאה", value: goalSpend(input, parts, "leads") },
      { label: "לידים", value: format.formatNumber(leads.leads) },
      {
        label: "עלות לליד",
        value: parts
          ? formatGoalMoney(parts, (m) => m.spend, { count: (m) => m.leads })
          : leads.cpl > 0
            ? format.formatCurrency(leads.cpl)
            : "-",
      },
    ],
    note:
      perPlatform.length > 1
        ? `לפי פלטפורמה: ${perPlatform.join(" · ")}`
        : null,
  };
}

/** Spend, clicks and cost per click. */
function trafficPanel(input: PanelInput): GoalPanel {
  const { summary, format } = input;
  const traffic = summary.goals.traffic;
  const parts = goalRowsMoney(summary, "traffic", input.currencies);
  return {
    goal: "traffic",
    figures: [
      { label: "הוצאה", value: goalSpend(input, parts, "traffic") },
      { label: "קליקים", value: format.formatNumber(traffic.clicks) },
      {
        label: "עלות לקליק",
        value: parts
          ? formatGoalMoney(parts, (m) => m.spend, {
              count: (m) => m.clicks,
              unitCost: true,
            })
          : traffic.clicks > 0
            ? format.formatUnitCost(traffic.spend / traffic.clicks)
            : "-",
      },
    ],
    note: null,
  };
}

/** A goal's spend, per currency when its platforms' currencies differ. */
function goalSpend(
  { summary, format }: PanelInput,
  parts: Array<GoalMoneyPart> | null,
  goal: ReportCampaignGoal,
): string {
  return parts
    ? formatGoalMoney(parts, (m) => m.spend)
    : format.formatCurrency(summary.goals[goal].spend);
}
