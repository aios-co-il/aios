import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import type { CurrencyCode } from "@/lib/currency";
import type { ReportFigures } from "../metrics/reportFigures";
import type { ReportScope } from "../metrics/reportMetricTypes";

/** An ads channel of a report; both Facebook table kinds show as Meta. */
export type ReportChannel = "facebook" | "google_ads";

/** One campaign of a goal's table. */
export type ReportCampaignRow = {
  key: string;
  name: string;
  channel: ReportChannel;
  /** On or off as the platform last reported it; null when it reports none. */
  on: boolean | null;
  figures: ReportFigures;
};

/** One scope of one period: its totals, channels, days and campaigns. */
export type ReportPeriodScope = {
  figures: ReportFigures;
  channels: Array<{ channel: ReportChannel; figures: ReportFigures }>;
  /** A day per date that has rows, oldest first. */
  daily: Array<{ date: string; figures: ReportFigures }>;
  campaigns: Array<ReportCampaignRow>;
};

/** A period of a dashboard, split by scope. */
export type ReportPeriod = {
  /** Goals with campaigns, or a store to measure, in report order. */
  goals: Array<ReportCampaignGoal>;
  scopes: Partial<Record<ReportScope, ReportPeriodScope>>;
};

/** One scope as a report shows it: this period, against the previous one. */
export type ReportScopeData = ReportPeriodScope & {
  previous: ReportFigures | null;
  /** The previous period's campaigns, for the campaign tables; null when off. */
  previousCampaigns: Array<ReportCampaignRow> | null;
};

/** Everything a report layout renders from. */
export type ReportData = {
  currency: CurrencyCode;
  goals: Array<ReportCampaignGoal>;
  scopes: Partial<Record<ReportScope, ReportScopeData>>;
  /** Whether the report offers "בקש תובנה מכרמן"; shared reports do not. */
  askCarmen: boolean;
};

/** The current period's scopes, each with the previous period's totals and campaigns. */
export function reportDataOf(input: {
  current: ReportPeriod;
  previous: ReportPeriod | null;
  currency: CurrencyCode;
  askCarmen?: boolean;
}): ReportData {
  const scopes: Partial<Record<ReportScope, ReportScopeData>> = {};
  for (const [scope, data] of scopeEntries(input.current)) {
    scopes[scope] = {
      ...data,
      previous: input.previous?.scopes[scope]?.figures ?? null,
      previousCampaigns: input.previous
        ? (input.previous.scopes[scope]?.campaigns ?? [])
        : null,
    };
  }
  return {
    currency: input.currency,
    goals: input.current.goals,
    scopes,
    askCarmen: input.askCarmen ?? false,
  };
}

/** A period's scopes as typed entries. */
function scopeEntries(
  period: ReportPeriod,
): Array<[ReportScope, ReportPeriodScope]> {
  const scopes: Array<ReportScope> = ["all", "ecommerce", "leads", "traffic"];
  return scopes.flatMap((scope) => {
    const data = period.scopes[scope];
    return data ? [[scope, data] as [ReportScope, ReportPeriodScope]] : [];
  });
}
