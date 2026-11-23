import { CONTINENT_TITLES, type Continent } from "./campaignContinent";
import type { ContinentSection } from "./continentSections";
import type { FacebookContinentSection } from "./facebookContinentSections";

/** One continent with each platform's campaigns there; null where it has none. */
export type CombinedContinent = {
  continent: Continent;
  title: string;
  facebook: FacebookContinentSection | null;
  google: ContinentSection | null;
};

/**
 * Every continent either platform has campaigns in, the one with the most
 * results first and "כללי" last. Spend cannot order them: the platforms'
 * currencies may differ.
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
  return [...byContinent.values()].sort(
    (a, b) =>
      Number(a.continent === "general") - Number(b.continent === "general") ||
      combinedResults(b) - combinedResults(a),
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

/** Meta's leads and purchases with Google's conversions in the continent. */
export function combinedResults({
  facebook,
  google,
}: Pick<CombinedContinent, "facebook" | "google">): number {
  return (
    (facebook ? facebook.totals.leads + facebook.totals.purchases : 0) +
    (google?.totals.conversions ?? 0)
  );
}
