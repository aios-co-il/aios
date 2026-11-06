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
      };
      byContinent.set(continent, section);
    }
    section.campaigns.push(row);
    addTotals(section.totals, row);
    addTotals(
      row.goal === "ecommerce" ? section.ecommerce : section.leads,
      row,
    );
  }
  return [...byContinent.values()].sort(
    (a, b) =>
      Number(a.continent === "general") - Number(b.continent === "general") ||
      b.totals.spend - a.totals.spend,
  );
}

/**
 * Whether campaign names are destinations: at least two continents, and most
 * of the campaigns name one. Other accounts never see the tab.
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
  return continents.size >= 2 && named * 2 >= unique.size;
}

/** The Google Ads campaign names among a dashboard's records. */
export function googleCampaignNames(
  records: Array<{ _source?: string; data?: Record<string, unknown> | null }>,
): Array<string> {
  return records
    .filter((record) => record._source === "google_ads")
    .map((record) => String(record.data?.campaign_name ?? ""))
    .filter(Boolean);
}
