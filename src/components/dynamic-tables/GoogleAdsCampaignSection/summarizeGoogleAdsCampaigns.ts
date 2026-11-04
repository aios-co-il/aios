import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import {
  campaignOffKeys,
  reportOffLookup,
  showCampaignRow,
} from "@/lib/campaignOffState";
import {
  googleCampaignGoalOf,
  type GoogleAdsRowData,
  type GoogleReportRecord,
  type GoogleReportTable,
} from "@/lib/googleCampaignGoals";
import {
  googleGoalPresence,
  googleReportFallbackGoal,
} from "@/lib/googleGoalPresence";
import type {
  GoogleAdsCampaignSummary,
  GoogleAdsCampaignSummaryRow,
  GoogleAdsTotals,
} from "./types";

/**
 * Google Ads campaigns of a report with each campaign's own goal (ecommerce or
 * leads). One account can run both, so totals are kept per goal: purchases and
 * ROAS only from ecommerce campaigns, conversions and cost per conversion only
 * from lead campaigns. Only campaign-level rows count: the sync also stores
 * ad group and ad rows under the same campaign id.
 */
export function summarizeGoogleAdsCampaigns(
  allRecords: GoogleReportRecord[],
  tables: GoogleReportTable[],
): GoogleAdsCampaignSummary {
  const records = allRecords.filter((record) =>
    shouldIncludeInAdsDashboardAggregate(record.data, "google_ads"),
  );
  const fallbackGoal = googleReportFallbackGoal(tables);
  const { goalOf } = googleCampaignGoalOf(records, tables, fallbackGoal);

  const offKeys = campaignOffKeys(
    records,
    (data) => campaignKey(data),
    reportOffLookup(tables),
  );
  const map = new Map<string, GoogleAdsCampaignSummaryRow>();
  for (const record of records) {
    const data = record.data || {};
    const key = campaignKey(data);
    let row = map.get(key);
    if (!row) {
      row = {
        name: campaignName(data),
        campaign_id: String(data.campaign_id || ""),
        goal: goalOf(data),
        off: offKeys.has(key),
        ...emptyTotals(),
      };
      map.set(key, row);
    }
    row.impressions += Number(data.impressions) || 0;
    row.clicks += Number(data.clicks) || 0;
    row.spend += Number(data.cost) || Number(data.spend) || 0;
    row.conversions += Number(data.conversions) || 0;
    row.conversions_value += Number(data.conversions_value) || 0;
  }

  const campaigns = [...map.values()]
    .filter(showCampaignRow)
    .sort((a, b) => b.spend - a.spend);
  const totals = emptyTotals();
  const ecommerce = emptyTotals();
  const leads = emptyTotals();
  for (const row of campaigns) {
    addTotals(totals, row);
    addTotals(row.goal === "ecommerce" ? ecommerce : leads, row);
  }
  const presence = googleGoalPresence(
    campaigns.map((row) => row.goal),
    fallbackGoal,
  );
  return { campaigns, totals, ecommerce, leads, ...presence };
}

/** A record's campaign name, as the table shows it. */
function campaignName(data: GoogleAdsRowData): string {
  return data.campaign_name || data.campaign || "ללא שם";
}

/** One campaign's row key: its id, or its name when the id is missing. */
function campaignKey(data: GoogleAdsRowData): string {
  return String(data.campaign_id || campaignName(data));
}

/** Zeroed metric totals. */
function emptyTotals(): GoogleAdsTotals {
  return {
    impressions: 0,
    clicks: 0,
    spend: 0,
    conversions: 0,
    conversions_value: 0,
  };
}

/** Add one campaign's metrics into a running total. */
function addTotals(target: GoogleAdsTotals, row: GoogleAdsTotals) {
  target.impressions += row.impressions;
  target.clicks += row.clicks;
  target.spend += row.spend;
  target.conversions += row.conversions;
  target.conversions_value += row.conversions_value;
}
