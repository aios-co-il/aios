import {
  aggregateFacebookRecordsAtLevel,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";
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
};

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
  const label = ENTITY_COLUMN_LABELS[level];
  if (facebookGroups) {
    return campaignTables(label, {
      ecommerce: facebookGroups.ecommerce.map(sharedFacebookRow),
      leads: facebookGroups.leads.map(sharedFacebookRow),
      traffic: facebookGroups.traffic.map(sharedFacebookRow),
    });
  }
  if (integrationType === "facebook_ecommerce") {
    // A Facebook Ecommerce table is a sales report by definition.
    const rows = aggregateFacebookRecordsAtLevel(records, level);
    return campaignTables(label, {
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
    return campaignTables(label, { ecommerce, leads, traffic: [] });
  }
  return campaignTables(label, { ecommerce: [], leads: [], traffic: [] });
}

/** The tables by goal, plus every row in report order. */
function campaignTables(
  entityColumnLabel: string,
  byGoal: Record<ReportCampaignGoal, SharedCampaignRow[]>,
): SharedCampaignTables {
  const all = REPORT_CAMPAIGN_GOALS.flatMap((goal) => byGoal[goal]);
  return { ...byGoal, all, entityColumnLabel };
}

/** A Facebook campaign row with the columns the shared tables show. */
function sharedFacebookRow(row: FacebookCampaignRow): SharedCampaignRow {
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
