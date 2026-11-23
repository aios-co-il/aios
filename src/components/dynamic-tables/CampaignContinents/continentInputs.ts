import type { CampaignOffTable } from "@/lib/campaignOffState";
import type { DashboardFacebookCampaigns } from "@/lib/dashboardCampaignGoals";
import type { FacebookTabFormatters } from "@/components/FacebookReportTab/facebookColumns";
import type { FacebookTabRecord } from "@/components/FacebookReportTab/facebookTabFigures";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
} from "../GoogleAdsCampaignSection/types";
import type { Continent } from "./campaignContinent";

/** What the Meta continents views read, in the Meta account's currency. */
export type FacebookContinentsInput = FacebookTabFormatters & {
  /** The Meta campaigns of the period, by goal (dashboardFacebookCampaigns). */
  campaigns: DashboardFacebookCampaigns;
  /** The period's records; their Meta rows mark each campaign on or off. */
  records: Array<FacebookTabRecord>;
  tables: Array<CampaignOffTable>;
};

/** What the Google continents views read, in the Google account's currency. */
export type GoogleContinentsInput = GoogleAdsFormatters & {
  /** The Google Ads campaigns of the period (summarizeGoogleAdsCampaigns). */
  campaigns: Array<GoogleAdsCampaignSummaryRow>;
};

/** Which platforms' campaign names name destinations (continentPlatforms). */
export type ContinentPlatforms = { facebook: boolean; google: boolean };

/** The id a continent's campaigns sit under; the summary rows link to it. */
export function continentAnchor(continent: Continent): string {
  return `continent-${continent}`;
}

/** "כללי" after every named continent; otherwise the caller's order. */
export function generalLast(a: Continent, b: Continent): number {
  return Number(a === "general") - Number(b === "general");
}
