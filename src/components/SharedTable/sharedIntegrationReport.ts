import type { AdsEntityLevel } from "@/lib/adsEntityLevel";
import { isFacebookLeadsOnlyTable } from "@/lib/adsMetrics";
import type { GoogleGoalPresence } from "@/lib/googleGoalPresence";
import type { GoogleCampaignGoal } from "../../../supabase/functions/_shared/pulse/google-campaign-goal.ts";
import {
  sharedCampaignTables,
  type SharedCampaignTables,
  type SharedReportRecord,
} from "./sharedCampaignTables";
import { groupSharedFacebookRows } from "./sharedFacebookGroups";
import { sharedManualRoiFigures } from "./sharedManualRoi";
import {
  summarizeSharedTableRecords,
  type SharedTableSummary,
} from "./sharedTableSummary";
import type { SharedTableGoals } from "./useSharedTableGoals";

/** What a shared integration table shows: KPIs, campaign tables and manual ROI. */
export type SharedIntegrationReport = {
  /** Goals the report has campaigns of; without sales the KPIs show no sales. */
  goals: GoogleGoalPresence;
  summary: SharedTableSummary | null;
  campaigns: SharedCampaignTables;
  manualRoi: { spend: number; leads: number } | null;
};

/**
 * A shared integration table's KPIs, campaign tables and manual ROI figures
 * from its records at one entity level. Facebook Insights splits campaigns by
 * facebookCampaignGoal and Google Ads by its campaigns' goals, like the internal
 * report; the KPIs count each campaign toward its own goal only.
 */
export function sharedIntegrationReport(
  records: SharedReportRecord[],
  options: {
    integrationType: string;
    level: AdsEntityLevel;
    integrationSettings?: Record<string, unknown> | null;
    /** Goals of a Google Ads table's campaigns (useSharedTableGoals). */
    tableGoals: SharedTableGoals;
    /** The table's own goal for rows no rule can key. */
    tableMode: GoogleCampaignGoal;
  },
): SharedIntegrationReport {
  const { integrationType, integrationSettings, tableGoals } = options;
  const facebookGroups =
    integrationType === "facebook_insights"
      ? groupSharedFacebookRows(records, options.level, {
          leadsOnly: isFacebookLeadsOnlyTable(integrationSettings),
        })
      : null;
  const goals = facebookGroups
    ? {
        hasEcommerce: facebookGroups.ecommerce.length > 0,
        hasLeads: facebookGroups.leads.length > 0,
      }
    : { hasEcommerce: tableGoals.hasEcommerce, hasLeads: tableGoals.hasLeads };
  const isIntegration =
    isAdsPlatform(integrationType) || isAnalyticsPlatform(integrationType);
  const summary = isIntegration
    ? summarizeSharedTableRecords(records, {
        integrationType,
        goalOf: facebookGroups?.goalOf ?? tableGoals.goalOf,
        goals,
      })
    : null;
  const campaigns = sharedCampaignTables(records, options, facebookGroups);
  const manualRoi = summary
    ? sharedManualRoiFigures({
        leadRows: campaigns.leads,
        summary,
        integrationSettings,
      })
    : null;
  return { goals, summary, campaigns, manualRoi };
}

/** Integration types whose shared report shows ads campaigns. */
export function isAdsPlatform(type: string): boolean {
  return ["facebook_insights", "facebook_ecommerce", "google_ads"].includes(
    type,
  );
}

/** Integration types whose shared report shows site analytics. */
export function isAnalyticsPlatform(type: string): boolean {
  return type === "google_analytics";
}
