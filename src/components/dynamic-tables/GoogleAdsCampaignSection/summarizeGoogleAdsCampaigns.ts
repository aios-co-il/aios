import {
  googleCampaignGoalOf,
  type GoogleReportCampaignGoal,
  type GoogleReportRecord,
  type GoogleReportTable,
} from "@/lib/googleCampaignGoals";
import type {
  GoogleAdsCampaignSummary,
  GoogleAdsCampaignSummaryRow,
  GoogleAdsTotals,
} from "./types";

/**
 * Google Ads campaigns of a report with each campaign's own goal (ecommerce or
 * leads). One account can run both, so totals are kept per goal: purchases and
 * ROAS only from ecommerce campaigns, conversions and cost per conversion only
 * from lead campaigns.
 */
export function summarizeGoogleAdsCampaigns(
  records: GoogleReportRecord[],
  tables: GoogleReportTable[],
): GoogleAdsCampaignSummary {
  const fallbackGoal: GoogleReportCampaignGoal = tables.some(
    (table) =>
      table.integration_type === "google_ads" &&
      table.integration_settings?.campaign_type === "ecommerce",
  )
    ? "ecommerce"
    : "leads";
  const { goalOf } = googleCampaignGoalOf(records, tables, fallbackGoal);

  const map = new Map<string, GoogleAdsCampaignSummaryRow>();
  for (const record of records) {
    const data = record.data || {};
    const name = data.campaign_name || data.campaign || "ללא שם";
    const key = data.campaign_id || name;
    let row = map.get(key);
    if (!row) {
      row = {
        name,
        campaign_id: data.campaign_id || "",
        goal: goalOf(data),
        ...emptyTotals(),
      };
      map.set(key, row);
    }
    row.impressions += data.impressions || 0;
    row.clicks += data.clicks || 0;
    row.spend += data.cost || data.spend || 0;
    row.conversions += data.conversions || 0;
    row.conversions_value += data.conversions_value || 0;
  }

  const campaigns = [...map.values()].sort((a, b) => b.spend - a.spend);
  const totals = emptyTotals();
  const ecommerce = emptyTotals();
  const leads = emptyTotals();
  for (const row of campaigns) {
    addTotals(totals, row);
    addTotals(row.goal === "ecommerce" ? ecommerce : leads, row);
  }
  const hasEcommerce = campaigns.length
    ? campaigns.some((row) => row.goal === "ecommerce")
    : fallbackGoal === "ecommerce";
  const hasLeads = campaigns.length
    ? campaigns.some((row) => row.goal === "leads")
    : fallbackGoal === "leads";
  return { campaigns, totals, ecommerce, leads, hasEcommerce, hasLeads };
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
