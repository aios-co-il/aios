import type {
  InsightFigures,
  InsightScope,
  ReportInsightRequest,
} from "@functions/carmen-report-insight/types.ts";
import type { ReportFigures } from "../metrics/reportFigures";
import type { ReportScope } from "../metrics/reportMetricTypes";
import type { ReportData, ReportScopeData } from "./reportData";

/** Matches the edge function's MAX_CAMPAIGNS: the largest spenders go first. */
const CAMPAIGNS_PER_SCOPE = 15;

/** The figures on screen, as Carmen reads them for an insight. */
export function reportInsightRequestOf(data: ReportData): ReportInsightRequest {
  const scopes = (
    Object.entries(data.scopes) as Array<[ReportScope, ReportScopeData]>
  ).map(([scope, scopeData]) => insightScopeOf(scope, scopeData));
  return { currency: data.currency, scopes };
}

/** One scope with its previous period and its largest campaigns. */
function insightScopeOf(
  scope: ReportScope,
  data: ReportScopeData,
): InsightScope {
  const campaigns = [...data.campaigns]
    .sort((a, b) => b.figures.spend - a.figures.spend)
    .slice(0, CAMPAIGNS_PER_SCOPE)
    .map((campaign) => ({
      name: campaign.name,
      channel: campaign.channel,
      on: campaign.on,
      figures: insightFiguresOf(campaign.figures),
    }));
  return {
    scope,
    figures: insightFiguresOf(data.figures),
    previous: data.previous ? insightFiguresOf(data.previous) : null,
    campaigns,
  };
}

function insightFiguresOf(figures: ReportFigures): InsightFigures {
  return {
    spend: figures.spend,
    impressions: figures.impressions,
    clicks: figures.clicks,
    leads: figures.leads,
    purchases: figures.purchases,
    revenue: figures.revenue,
    sessions: figures.analytics?.sessions ?? null,
  };
}
