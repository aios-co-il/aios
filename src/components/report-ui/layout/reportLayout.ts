import {
  REPORT_CAMPAIGN_GOALS,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import type {
  ReportMetricKey,
  ReportScope,
} from "../metrics/reportMetricTypes";
import {
  DELIVERY_KPI_METRICS,
  GOAL_CAMPAIGN_COLUMNS,
  GOAL_CHANNELS,
  GOAL_KPI_METRICS,
  GOAL_TRENDS,
} from "./goalDefaults";

export {
  DELIVERY_KPI_METRICS,
  GOAL_CAMPAIGN_COLUMNS,
  GOAL_KPI_METRICS,
} from "./goalDefaults";

/** One block of a report section; `id` keeps it addressable once stored. */
export type ReportWidget =
  | { id: string; kind: "kpis"; metrics: Array<ReportMetricKey> }
  | {
      id: string;
      kind: "channels";
      metric: ReportMetricKey;
      /** A second figure beside each channel's bar, e.g. its cost per lead. */
      detail?: ReportMetricKey;
      /** Shown instead when the scope cannot measure `metric`. */
      fallback?: { metric: ReportMetricKey; detail?: ReportMetricKey };
    }
  | {
      id: string;
      kind: "trend";
      metric: ReportMetricKey;
      /** A second line in the brand's neutral, e.g. spend under revenue. */
      compare?: ReportMetricKey;
      /** Shown instead when the scope cannot measure `metric`. */
      fallback?: { metric: ReportMetricKey; compare?: ReportMetricKey };
    }
  | { id: string; kind: "campaigns"; metrics: Array<ReportMetricKey> }
  | { id: string; kind: "insight" };

export type ReportWidgetKind = ReportWidget["kind"];

/** A run of widgets over one scope: every campaign, or one goal's. */
export type ReportLayoutSection = {
  scope: ReportScope;
  widgets: Array<ReportWidget>;
};

/**
 * What a report shows and in what order. Hiding a block or a metric is
 * leaving it out of this list; it is the shape a dashboard will store.
 */
export type ReportLayout = {
  version: 1;
  sections: Array<ReportLayoutSection>;
};

/**
 * The layout of a dashboard with campaigns of these goals: delivery and site
 * traffic for every campaign, then a section per goal in report order
 * (headline metrics, channels, trend and campaign table), then Carmen.
 */
export function defaultReportLayout(
  goalsPresent: ReadonlyArray<ReportCampaignGoal>,
): ReportLayout {
  const goals = REPORT_CAMPAIGN_GOALS.filter((goal) =>
    goalsPresent.includes(goal),
  );
  return {
    version: 1,
    sections: [
      deliverySection(goals),
      ...goals.map(goalSection),
      { scope: "all", widgets: [{ id: "all:insight", kind: "insight" }] },
    ],
  };
}

/**
 * Delivery for every campaign. Sessions join it unless a traffic section
 * shows them, and a channel split only when goal sections do not each show one.
 */
function deliverySection(
  goals: Array<ReportCampaignGoal>,
): ReportLayoutSection {
  const metrics: Array<ReportMetricKey> = goals.includes("traffic")
    ? DELIVERY_KPI_METRICS
    : [...DELIVERY_KPI_METRICS, "sessions"];
  const widgets: Array<ReportWidget> = [
    { id: "all:kpis", kind: "kpis", metrics },
  ];
  if (goals.length !== 1) {
    widgets.push({
      id: "all:channels",
      kind: "channels",
      metric: "spend",
      detail: "clicks",
    });
  }
  widgets.push(
    { id: "all:trend:spend", kind: "trend", metric: "spend" },
    { id: "all:trend:sessions", kind: "trend", metric: "sessions" },
  );
  return { scope: "all", widgets };
}

/** One goal's headline metrics, channels, trend and campaign table. */
function goalSection(goal: ReportCampaignGoal): ReportLayoutSection {
  return {
    scope: goal,
    widgets: [
      { id: `${goal}:kpis`, kind: "kpis", metrics: GOAL_KPI_METRICS[goal] },
      { id: `${goal}:channels`, kind: "channels", ...GOAL_CHANNELS[goal] },
      { id: `${goal}:trend`, kind: "trend", ...GOAL_TRENDS[goal] },
      {
        id: `${goal}:campaigns`,
        kind: "campaigns",
        metrics: GOAL_CAMPAIGN_COLUMNS[goal],
      },
    ],
  };
}
