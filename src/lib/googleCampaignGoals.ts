// A Google Ads campaign's goal lives with the pulse, so the reports and the
// pulse judge each campaign by one rule.
export {
  googleCampaignGoalOf,
  googleCampaignGoalsForRecords,
  googleReportCampaignGoals,
  googleReportCampaignKey,
  type GoogleAdsRowData,
  type GoogleCampaignGoalLookup,
  type GoogleReportRecord,
  type GoogleReportTable,
} from "../../supabase/functions/_shared/campaign-goal/google-goal.ts";
