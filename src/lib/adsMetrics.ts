import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import {
  addFacebookFollowers,
  emptyFacebookFollowers,
  type FacebookFollowerTotals,
} from "@/lib/facebookFollowers";
import {
  getAddToCartFromData,
  getAdsPurchasesFromData,
  getLeadsFromData,
  getRevenueFromData,
  getSpendFromData,
  type AdsMetricData,
} from "../../supabase/functions/_shared/campaign-goal/ads-metrics.ts";
import {
  addFacebookCampaignTypeRow,
  effectiveFacebookCampaignType,
  isFacebookLeadsOnlyTable,
} from "../../supabase/functions/_shared/campaign-goal/facebook-type.ts";

// Result counts and the Facebook campaign type live with the pulse
// (_shared/campaign-goal/), so the reports, the dashboards and the pulse read
// every record the same way.
export {
  FACEBOOK_FORM_LEAD_ACTION_KEYS,
  getAddToCartFromData,
  getAdsPurchasesFromData,
  getExplicitLeadFieldsFromData,
  getFacebookFormLeadsFromData,
  getLeadsFromData,
  getMessagingLeadsFromData,
  getPurchasesFromData,
  getRevenueFromData,
  getSpendFromData,
  hasAddToCartMetric,
  type AdsMetricData,
  type RawAdsMetricData,
} from "../../supabase/functions/_shared/campaign-goal/ads-metrics.ts";
export {
  addFacebookCampaignTypeRow,
  effectiveFacebookCampaignType,
  FACEBOOK_ECOMMERCE_RESULT_KINDS,
  isFacebookEcommerceCampaign,
  isFacebookLeadsOnlyTable,
  preferFacebookCampaignType,
} from "../../supabase/functions/_shared/campaign-goal/facebook-type.ts";
export {
  facebookObjectiveKind,
  isFacebookMessagingLeadRecord,
} from "../../supabase/functions/_shared/campaign-goal/facebook-objective.ts";

type NullableRawAdsMetricData = Record<string, unknown> | null | undefined;
type NullableAdsMetricData = AdsMetricData | null | undefined;

export const getSessionsFromData = (data: NullableRawAdsMetricData) =>
  Number(data?.sessions) || 0;

export const getUsersFromData = (data: NullableRawAdsMetricData) =>
  Number(data?.users) || 0;

export type FacebookCampaignRow = {
  name: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  purchases: number;
  purchase_value: number;
  add_to_cart: number;
  campaign_type?: string;
  campaign_objective?: string | null;
  result_kind?: string | null;
  result?: { result_kind?: string | null } | null;
  /** Set by the record aggregators; traffic tables show it. */
  followers?: FacebookFollowerTotals;
};

export function isFacebookTrafficCampaign(data: FacebookCampaignRow): boolean {
  return effectiveFacebookCampaignType(data) === "traffic";
}

/**
 * Split aggregated Facebook campaigns into a single ecommerce or leads table
 * plus traffic, for dashboards without a mixed Facebook table. Mixed tables
 * split by groupFacebookRowsByGoal, like the reports.
 */
export function groupFacebookCampaigns(
  campaigns: FacebookCampaignRow[],
  options: { singleTableMode: "ecommerce" | "leads" },
): {
  ecommerce: FacebookCampaignRow[];
  leads: FacebookCampaignRow[];
  traffic: FacebookCampaignRow[];
} {
  const traffic = campaigns.filter(isFacebookTrafficCampaign);
  const nonTraffic = campaigns.filter((c) => !isFacebookTrafficCampaign(c));

  if (options.singleTableMode === "ecommerce") {
    // An ecommerce report can still run lead campaigns (e.g. recruiting) — show them as leads.
    const isLead = (c: FacebookCampaignRow) =>
      String(c.campaign_type || "").toLowerCase() === "lead";
    return {
      ecommerce: nonTraffic.filter((c) => !isLead(c)),
      leads: nonTraffic.filter(isLead),
      traffic,
    };
  }
  return { ecommerce: [], leads: nonTraffic, traffic };
}

/**
 * The key Facebook campaign rows are aggregated under: the campaign's name. The
 * reports key by campaign id, so two same-name campaigns still merge on the
 * dashboards and the share link (AIO-263).
 */
export function facebookCampaignKey(data: NullableAdsMetricData): string {
  return data?.campaign_name || data?.campaign || "ללא שם";
}

/** Aggregate facebook_insights / facebook_ecommerce records by campaign name. */
export function aggregateFacebookCampaignsFromRecords(
  records: Array<{ data?: NullableAdsMetricData }>,
): FacebookCampaignRow[] {
  const map: Record<
    string,
    FacebookCampaignRow & { followers: FacebookFollowerTotals }
  > = {};
  const types: Record<
    string,
    ReturnType<typeof addFacebookCampaignTypeRow>
  > = {};

  records.forEach((r) => {
    if (!shouldIncludeInAdsDashboardAggregate(r.data, "facebook_insights"))
      return;
    const d = r.data || {};
    const name = facebookCampaignKey(d);
    if (!map[name]) {
      map[name] = {
        name,
        impressions: 0,
        clicks: 0,
        spend: 0,
        leads: 0,
        purchases: 0,
        purchase_value: 0,
        add_to_cart: 0,
        followers: emptyFacebookFollowers(),
      };
    }
    map[name].impressions += Number(d.impressions) || 0;
    map[name].clicks += Number(d.clicks) || 0;
    map[name].spend += getSpendFromData(d);
    map[name].leads += getLeadsFromData(d);
    map[name].purchases += getAdsPurchasesFromData(d);
    map[name].purchase_value += getRevenueFromData(d);
    map[name].add_to_cart += getAddToCartFromData(d);
    map[name].followers = addFacebookFollowers(map[name].followers, d);
    types[name] = addFacebookCampaignTypeRow(
      types[name] ?? { configured: null, stored: "other" },
      d,
    );
  });

  for (const [name, type] of Object.entries(types)) {
    const campaignType = type.configured ?? type.stored;
    if (campaignType !== "other") map[name].campaign_type = campaignType;
  }
  return Object.values(map).sort((a, b) => b.spend - a.spend);
}

/** facebook_insights tables without an explicit leads-only flag show both ecom + lead campaigns. */
export function facebookTableUsesMixedRows(
  integrationType?: string | null,
  integrationSettings?: Record<string, unknown> | null,
): boolean {
  if (integrationType !== "facebook_insights") return false;
  return !isFacebookLeadsOnlyTable(integrationSettings);
}
