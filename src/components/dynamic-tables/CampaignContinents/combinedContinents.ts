import { CONTINENT_TITLES, type Continent } from "./campaignContinent";
import { generalLast, type ContinentPlatforms } from "./continentInputs";
import {
  googleCampaignNames,
  namesCampaignsByDestination,
  type ContinentSection,
} from "./continentSections";
import {
  facebookCampaignNames,
  type FacebookContinentSection,
} from "./facebookContinentSections";

/** One continent with each platform's campaigns there; null where it has none. */
export type CombinedContinent = {
  continent: Continent;
  title: string;
  facebook: FacebookContinentSection | null;
  google: ContinentSection | null;
};

/**
 * Which platforms' campaigns name destinations among a dashboard's records:
 * each earns its own "לפי יבשות" view, and both together the combined one.
 */
export function continentPlatforms(
  records: Array<{ _source?: string; data?: Record<string, unknown> | null }>,
): ContinentPlatforms {
  return {
    facebook: namesCampaignsByDestination(facebookCampaignNames(records)),
    google: namesCampaignsByDestination(googleCampaignNames(records)),
  };
}

/**
 * Every continent either platform has campaigns in: Meta's in its own order
 * (most spend first), then those only Google has, and "כללי" last. Spend is
 * never compared across platforms, whose currencies may differ.
 */
export function combinedContinents(
  facebook: Array<FacebookContinentSection>,
  google: Array<ContinentSection>,
): Array<CombinedContinent> {
  const byContinent = new Map<Continent, CombinedContinent>();
  for (const section of facebook) {
    entryOf(byContinent, section.continent).facebook = section;
  }
  for (const section of google) {
    entryOf(byContinent, section.continent).google = section;
  }
  return [...byContinent.values()].sort((a, b) =>
    generalLast(a.continent, b.continent),
  );
}

/** The continent's entry, created empty on first use. */
function entryOf(
  byContinent: Map<Continent, CombinedContinent>,
  continent: Continent,
): CombinedContinent {
  const existing = byContinent.get(continent);
  if (existing) {
    return existing;
  }
  const entry: CombinedContinent = {
    continent,
    title: CONTINENT_TITLES[continent],
    facebook: null,
    google: null,
  };
  byContinent.set(continent, entry);
  return entry;
}
