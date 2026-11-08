import {
  addTotals,
  emptyTotals,
} from "../GoogleAdsCampaignSection/googleAdsTotals";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsTotals,
} from "../GoogleAdsCampaignSection/types";
import {
  CONTINENT_TITLES,
  campaignContinent,
  type Continent,
} from "./campaignContinent";

/** One continent's campaigns and their totals. */
export type ContinentSection = {
  continent: Continent;
  title: string;
  campaigns: Array<GoogleAdsCampaignSummaryRow>;
  totals: GoogleAdsTotals;
  ecommerce: GoogleAdsTotals;
  leads: GoogleAdsTotals;
  /** Campaigns set to pay for exposure: their spend stays out of lead and sales totals (AIO-496). */
  traffic: GoogleAdsTotals;
};

/**
 * The campaigns grouped by the continent their name names, the continent
 * that spent most first and "כללי" last. Rows keep their order inside a
 * continent.
 */
export function continentSections(
  campaigns: Array<GoogleAdsCampaignSummaryRow>,
): Array<ContinentSection> {
  const byContinent = new Map<Continent, ContinentSection>();
  for (const row of campaigns) {
    const continent = campaignContinent(row.name);
    let section = byContinent.get(continent);
    if (!section) {
      section = {
        continent,
        title: CONTINENT_TITLES[continent],
        campaigns: [],
        totals: emptyTotals(),
        ecommerce: emptyTotals(),
        leads: emptyTotals(),
        traffic: emptyTotals(),
      };
      byContinent.set(continent, section);
    }
    section.campaigns.push(row);
    addTotals(section.totals, row);
    addTotals(section[row.goal], row);
  }
  return [...byContinent.values()].sort(
    (a, b) =>
      Number(a.continent === "general") - Number(b.continent === "general") ||
      b.totals.spend - a.totals.spend,
  );
}

/**
 * Whether campaign names are destinations: at least two continents, and more
 * than half of the campaigns name one. Other accounts never see the tab.
 */
export function namesCampaignsByDestination(names: Iterable<string>): boolean {
  const unique = new Set(names);
  const continents = new Set<Continent>();
  let named = 0;
  for (const name of unique) {
    const continent = campaignContinent(name);
    if (continent !== "general") {
      continents.add(continent);
      named++;
    }
  }
  return continents.size >= 2 && named * 2 > unique.size;
}

/** The Google Ads campaign names among a dashboard's records. */
export function googleCampaignNames(
  records: Array<{ _source?: string; data?: Record<string, unknown> | null }>,
): Array<string> {
  return recordCampaignNames(
    records.filter((record) => record._source === "google_ads"),
  );
}

/**
 * Each record's campaign name, as the Google Ads summary shows it:
 * `campaign_name`, else `campaign`.
 */
export function recordCampaignNames(
  records: Array<{ data?: Record<string, unknown> | null }>,
): Array<string> {
  return records
    .map((record) =>
      String(record.data?.campaign_name || record.data?.campaign || ""),
    )
    .filter(Boolean);
}
