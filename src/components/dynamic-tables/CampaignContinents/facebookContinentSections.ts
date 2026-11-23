import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import { REPORT_CAMPAIGN_GOALS } from "@/lib/campaignGoals";
import type { DashboardFacebookCampaigns } from "@/lib/dashboardCampaignGoals";
import type { FacebookTabFormatters } from "@/components/FacebookReportTab/facebookColumns";
import {
  facebookTabTotals,
  type FacebookTabTotals,
} from "@/components/FacebookReportTab/facebookTabFigures";
import {
  CONTINENT_TITLES,
  campaignContinent,
  type Continent,
} from "./campaignContinent";

/** One continent's Meta campaigns, by goal, and their totals. */
export type FacebookContinentSection = {
  continent: Continent;
  title: string;
  campaigns: DashboardFacebookCampaigns;
  totals: FacebookTabTotals;
  /** Spend on lead and sales campaigns: what their results are set against. */
  resultSpend: number;
};

const META_SOURCES: ReadonlySet<string> = new Set([
  "facebook_insights",
  "facebook_ecommerce",
]);

/**
 * The Meta campaigns grouped by the continent their name names, as the Google
 * continents are (continentSections): the continent that spent most first and
 * "כללי" last, each keeping its goal tables.
 */
export function facebookContinentSections(
  campaigns: DashboardFacebookCampaigns,
): Array<FacebookContinentSection> {
  const byContinent = new Map<Continent, FacebookContinentSection>();
  for (const goal of REPORT_CAMPAIGN_GOALS) {
    for (const row of campaigns[goal]) {
      sectionOf(byContinent, campaignContinent(row.name)).campaigns[goal].push(
        row,
      );
    }
  }
  for (const row of campaigns.all) {
    sectionOf(byContinent, campaignContinent(row.name)).campaigns.all.push(row);
  }
  const sections = [...byContinent.values()].map((section) => ({
    ...section,
    totals: facebookTabTotals(section.campaigns.all),
    resultSpend: spendOf([
      ...section.campaigns.leads,
      ...section.campaigns.ecommerce,
    ]),
  }));
  return sections.sort(
    (a, b) =>
      Number(a.continent === "general") - Number(b.continent === "general") ||
      b.totals.spend - a.totals.spend,
  );
}

export const FACEBOOK_SUMMARY_HEADERS = [
  "קמפיינים",
  "הוצאה",
  "קליקים",
  "לידים",
  "רכישות",
  "עלות לתוצאה",
];

/** A continent's Meta summary cells, under FACEBOOK_SUMMARY_HEADERS. */
export function facebookSummaryCells(
  { campaigns, totals, resultSpend }: FacebookContinentSection,
  { formatCurrency, formatNumber }: FacebookTabFormatters,
): Array<string> {
  const results = totals.leads + totals.purchases;
  return [
    formatNumber(campaigns.all.length),
    formatCurrency(totals.spend),
    formatNumber(totals.clicks),
    formatNumber(totals.leads),
    formatNumber(totals.purchases),
    results > 0 ? formatCurrency(resultSpend / results) : "-",
  ];
}

/** The Meta campaign names among records tagged with their source. */
export function facebookCampaignNames(
  records: Array<{ _source?: string; data?: Record<string, unknown> | null }>,
): Array<string> {
  return records
    .filter((record) => META_SOURCES.has(record._source ?? ""))
    .map((record) =>
      String(record.data?.campaign_name || record.data?.campaign || ""),
    )
    .filter(Boolean);
}

/** The continent's section, created empty on first use. */
function sectionOf(
  byContinent: Map<Continent, FacebookContinentSection>,
  continent: Continent,
): FacebookContinentSection {
  const existing = byContinent.get(continent);
  if (existing) {
    return existing;
  }
  const section: FacebookContinentSection = {
    continent,
    title: CONTINENT_TITLES[continent],
    campaigns: { ecommerce: [], leads: [], traffic: [], all: [] },
    totals: facebookTabTotals([]),
    resultSpend: 0,
  };
  byContinent.set(continent, section);
  return section;
}

/** The campaigns' spend added up. */
function spendOf(rows: Array<FacebookCampaignRow>): number {
  return rows.reduce((sum, row) => sum + row.spend, 0);
}
