import {
  aggregateFacebookRecordsAtLevel,
  getEntityDisplayName,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";
import { applyCampaignOffRule, campaignOffKeys } from "@/lib/campaignOffState";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import {
  REPORT_CAMPAIGN_GOALS,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import type { FacebookFollowerTotals } from "@/lib/facebookFollowers";
import type { GoogleAdsRowData } from "@/lib/googleCampaignGoals";
import type { GoogleCampaignGoal } from "../../../supabase/functions/_shared/pulse/google-campaign-goal.ts";
import { googleCampaignRowsByGoal } from "./googleCampaignRowsByGoal";
import type { SharedTableGoals } from "./useSharedTableGoals";

/** A shared table's record: any integration's row, typed where Google Ads reads it. */
export type SharedReportRecord = {
  data?: (GoogleAdsRowData & Record<string, unknown>) | null;
};

/** One campaign (or ad set / ad) row of the shared report's campaign tables. */
export type SharedCampaignRow = {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  addToCart: number;
  /** Facebook only; traffic tables show it. */
  followers?: FacebookFollowerTotals;
  /** Paused or removed on the platform; shown only when it spent. */
  off: boolean;
};

/** A row as the aggregators build it, before its on/off state is known. */
type AggregatedRow = Omit<SharedCampaignRow, "off">;

/** The shared report's campaign tables, one per goal, at one entity level. */
export type SharedCampaignTables = Record<
  ReportCampaignGoal,
  SharedCampaignRow[]
> & {
  all: SharedCampaignRow[];
  /** Heading of the name column: campaign, ad set or ad. */
  entityColumnLabel: string;
};

/**
 * The campaign tables of a shared ads table at one entity level, empty for any
 * other table. Facebook Insights rows come already split by goal.
 */
export function sharedCampaignTables(
  records: SharedReportRecord[],
  options: {
    integrationType: string;
    level: AdsEntityLevel;
    tableGoals: SharedTableGoals;
    tableMode: GoogleCampaignGoal;
  },
  facebookGroups: Record<ReportCampaignGoal, FacebookCampaignRow[]> | null,
): SharedCampaignTables {
  const { integrationType, level, tableGoals, tableMode } = options;
  const finish = (byGoal: Record<ReportCampaignGoal, AggregatedRow[]>) =>
    campaignTables(ENTITY_COLUMN_LABELS[level], byGoal, records, level);
  if (facebookGroups) {
    return finish({
      ecommerce: facebookGroups.ecommerce.map(sharedFacebookRow),
      leads: facebookGroups.leads.map(sharedFacebookRow),
      traffic: facebookGroups.traffic.map(sharedFacebookRow),
    });
  }
  if (integrationType === "facebook_ecommerce") {
    // A Facebook Ecommerce table is a sales report by definition.
    const rows = aggregateFacebookRecordsAtLevel(records, level);
    return finish({
      ecommerce: rows.map(sharedFacebookRow),
      leads: [],
      traffic: [],
    });
  }
  if (integrationType === "google_ads") {
    const { ecommerce, leads } = googleCampaignRowsByGoal(
      records,
      level,
      tableGoals.goalOf ?? (() => tableMode),
    );
    return finish({ ecommerce, leads, traffic: [] });
  }
  return finish({ ecommerce: [], leads: [], traffic: [] });
}

/**
 * The tables by goal, plus every row in report order. Rows are keyed by the
 * name the table shows, and off rows that spent nothing are left out. Public
 * shares carry no report switch, so only the platform status counts here.
 */
function campaignTables(
  entityColumnLabel: string,
  byGoal: Record<ReportCampaignGoal, AggregatedRow[]>,
  records: SharedReportRecord[],
  level: AdsEntityLevel,
): SharedCampaignTables {
  const offNames = campaignOffKeys(records, (data) =>
    getEntityDisplayName(data, level),
  );
  const mark = (rows: AggregatedRow[]) =>
    applyCampaignOffRule(rows, {
      keyOf: (row) => row.name,
      spendOf: (row) => row.spend,
      offKeys: offNames,
    });
  const marked = {
    ecommerce: mark(byGoal.ecommerce),
    leads: mark(byGoal.leads),
    traffic: mark(byGoal.traffic),
  };
  const all = REPORT_CAMPAIGN_GOALS.flatMap((goal) => marked[goal]);
  return { ...marked, all, entityColumnLabel };
}

/** A Facebook campaign row with the columns the shared tables show. */
function sharedFacebookRow(row: FacebookCampaignRow): AggregatedRow {
  return {
    name: row.name,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    leads: Math.round(row.leads),
    purchases: row.purchases,
    revenue: row.purchase_value,
    addToCart: row.add_to_cart,
    followers: row.followers,
  };
}

const ENTITY_COLUMN_LABELS: Record<AdsEntityLevel, string> = {
  campaign: "קמפיין",
  adset: "קבוצת מודעות",
  ad: "מודעה",
};
