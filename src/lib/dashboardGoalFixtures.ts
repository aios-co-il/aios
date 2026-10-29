import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import { groupFacebookRowsByGoal } from "@/lib/facebookGoalGroups";
import { summarizeDashboardGoals } from "@/lib/dashboardGoalSummary";

/** A dashboard record as the pages tag it: its source table and campaign row. */
type DashboardRecord = {
  _source: string;
  _tableId: string;
  data: Record<string, unknown>;
};

const record = (
  source: string,
  tableId: string,
  delivery: Record<string, number>,
) => {
  return (name: string, data: Record<string, unknown>): DashboardRecord => ({
    _source: source,
    _tableId: tableId,
    data: {
      date: "2026-10-20",
      campaign_id: name,
      campaign_name: name,
      entity_level: "campaign",
      ...delivery,
      ...data,
    },
  });
};

export const facebookRecord = record("facebook_insights", "fb", {
  impressions: 1000,
  clicks: 40,
});

export const googleRecord = record("google_ads", "g", {
  impressions: 500,
  clicks: 20,
});

const tables = [
  { id: "fb", integration_type: "facebook_insights", integration_settings: {} },
  { id: "g", integration_type: "google_ads", integration_settings: {} },
];

/**
 * The dashboard's goals from the same groupings its platform tabs show: a
 * mixed Facebook table and a Google Ads table without a set type.
 */
export function dashboardGoalsOf(records: DashboardRecord[]) {
  const of = (source: string) => records.filter((r) => r._source === source);
  return summarizeDashboardGoals({
    facebook: groupFacebookRowsByGoal(of("facebook_insights"), "campaign", {
      leadsOnly: false,
    }),
    google: summarizeGoogleAdsCampaigns(of("google_ads"), tables).campaigns,
  });
}

/** Lead campaigns only; the Facebook one also fires a stray pixel purchase. */
export const leadCampaigns = [
  facebookRecord("FB leads", {
    campaign_objective: "OUTCOME_LEADS",
    spend: 300,
    leads: 10,
    purchases: 1,
    purchase_value: 900,
  }),
  googleRecord("Search leads", {
    conversion_goal: "leads",
    cost: 100,
    conversions: 10,
    conversions_value: 50,
  }),
];

/**
 * Sales: ₪400 spend, 10 purchases, ₪1,400 revenue. Leads: ₪600, 5 leads.
 * Traffic: ₪50. Rows: Facebook 5x and Google 3x ROAS; ₪50 and ₪400 per lead.
 */
export const mixedCampaigns = [
  facebookRecord("FB sales", {
    campaign_objective: "OUTCOME_SALES",
    spend: 100,
    purchases: 4,
    purchase_value: 500,
    add_to_cart: 9,
    leads: 3,
  }),
  facebookRecord("FB leads", {
    campaign_objective: "OUTCOME_LEADS",
    spend: 200,
    leads: 4,
  }),
  facebookRecord("FB traffic", {
    campaign_objective: "OUTCOME_TRAFFIC",
    spend: 50,
  }),
  googleRecord("Shopping", {
    conversion_goal: "ecommerce",
    cost: 300,
    conversions: 6,
    conversions_value: 900,
  }),
  googleRecord("Search leads", {
    conversion_goal: "leads",
    cost: 400,
    conversions: 1,
    conversions_value: 40,
  }),
];
