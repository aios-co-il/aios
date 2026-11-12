import type { AdsEntityLevel } from "@/lib/adsEntityLevel";
import { isFacebookLeadsOnlyTable } from "@/lib/adsMetrics";
import { groupFacebookRowsByGoal } from "@/lib/facebookGoalGroups";
import type { GoogleGoalPresence } from "@/lib/googleGoalPresence";
import type { GoogleCampaignGoal } from "../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import type { GoogleAdsRowData } from "@/lib/googleCampaignGoals";
import {
  summarizeSharedTableRecords,
  type SharedTableSummary,
} from "./sharedTableSummary";
import type { SharedTableGoals } from "./useSharedTableGoals";

/** A shared table's record: any integration's row, typed where Google Ads reads it. */
export type SharedReportRecord = {
  data?: (GoogleAdsRowData & Record<string, unknown>) | null;
};

/** The KPI cards of a shared integration table; its campaign tables are AdsGoalTables. */
export type SharedIntegrationReport = {
  /** Goals the report has campaigns of; without sales the KPIs show no sales. */
  goals: GoogleGoalPresence;
  summary: SharedTableSummary | null;
};

/**
 * A shared integration table's KPIs from its records at one entity level.
 * Facebook Insights splits campaigns by facebookCampaignGoal and Google Ads by its campaigns' goals, like the internal
 * report; the KPIs count each campaign toward its own goal only.
 */
export function sharedIntegrationReport(
  records: Array<SharedReportRecord>,
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
      ? groupFacebookRowsByGoal(records, options.level, {
          leadsOnly: isFacebookLeadsOnlyTable(integrationSettings),
        })
      : null;
  const goals = facebookGroups
    ? {
        hasEcommerce: facebookGroups.ecommerce.length > 0,
        hasLeads: facebookGroups.leads.length > 0,
        hasTraffic: facebookGroups.traffic.length > 0,
      }
    : {
        hasEcommerce: tableGoals.hasEcommerce,
        hasLeads: tableGoals.hasLeads,
        hasTraffic: tableGoals.hasTraffic,
      };
  const isIntegration =
    isAdsPlatform(integrationType) || isAnalyticsPlatform(integrationType);
  const summary = isIntegration
    ? summarizeSharedTableRecords(records, {
        integrationType,
        goalOf: facebookGroups?.goalOf ?? tableGoals.goalOf,
        goals,
      })
    : null;
  return { goals, summary };
}

/** The ads integrations whose shared report shows campaigns. */
export type AdsPlatform =
  "facebook_insights" | "facebook_ecommerce" | "google_ads";

/** Integration types whose shared report shows ads campaigns. */
export function isAdsPlatform(type: string): type is AdsPlatform {
  return (
    type === "facebook_insights" ||
    type === "facebook_ecommerce" ||
    type === "google_ads"
  );
}

/** Integration types whose shared report shows site analytics. */
export function isAnalyticsPlatform(type: string): boolean {
  return type === "google_analytics";
}
