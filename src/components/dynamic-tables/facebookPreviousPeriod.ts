import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import type {
  FacebookReportCampaign,
  FacebookReportEntry,
} from "./facebookReportCampaigns";

/** One Facebook table's previous period, for its comparison columns. */
export type FacebookTablePrevious = {
  /** Each entity's previous row, whatever table it sat in then. */
  byKey: Map<string, FacebookReportCampaign>;
  /** The previous period's rows of this table, for its total row. */
  campaigns: Array<FacebookReportCampaign>;
};

/** The previous period's rows of each Facebook table, keyed for lookup. */
export function facebookPreviousPeriod(
  groups: Record<ReportCampaignGoal, Array<FacebookReportEntry>>,
): Record<ReportCampaignGoal, FacebookTablePrevious> {
  const byKey = new Map<string, FacebookReportCampaign>([
    ...groups.ecommerce,
    ...groups.leads,
    ...groups.traffic,
  ]);
  /** One table's previous rows with the shared lookup. */
  function tableOf(goal: ReportCampaignGoal): FacebookTablePrevious {
    return { byKey, campaigns: groups[goal].map(([, campaign]) => campaign) };
  }
  return {
    ecommerce: tableOf("ecommerce"),
    leads: tableOf("leads"),
    traffic: tableOf("traffic"),
  };
}

/**
 * The previous rows a table row or total compares with: the entity's own row,
 * or the table's rows for the total. Null when the entity did not run then,
 * undefined while the comparison is off.
 */
export function previousRowsOf(
  previous: FacebookTablePrevious | null | undefined,
  key: string | null,
): Array<FacebookReportCampaign> | null | undefined {
  if (!previous) {
    return undefined;
  }
  if (key === null) {
    return previous.campaigns;
  }
  const row = previous.byKey.get(key);
  return row ? [row] : null;
}
