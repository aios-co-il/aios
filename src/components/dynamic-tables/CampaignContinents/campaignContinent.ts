import { DESTINATIONS } from "./continentDestinations";

/** A continent a campaign's destination belongs to; "general" when its name names none. */
export type Continent =
  | "asia"
  | "africa"
  | "europe"
  | "north_america"
  | "south_america"
  | "oceania"
  | "antarctica"
  | "general";

export const CONTINENT_TITLES: Record<Continent, string> = {
  asia: "אסיה",
  africa: "אפריקה",
  europe: "אירופה",
  north_america: "צפון ומרכז אמריקה",
  south_america: "דרום אמריקה",
  oceania: "אוקיאניה",
  antarctica: "אנטארקטיקה",
  general: "כללי",
};

/**
 * A destination as a whole word, after up to two Hebrew prefix letters
 * ("לפרו", "והודו", "האזוריים"), so "פרו" never matches inside another word.
 */
const MATCHERS = Object.entries(DESTINATIONS).flatMap(([continent, names]) =>
  names.map((name) => ({
    continent: continent as Continent,
    pattern: new RegExp(
      `(?:^|[^\\p{L}'"])[ולבהמש]{0,2}${escapeRegExp(name)}(?![\\p{L}])`,
      "u",
    ),
  })),
);

/**
 * The continent of the destination a campaign's name mentions first, so
 * "קרנבלים באירופה" is Europe and "דרום אמריקה" wins over its countries.
 */
export function campaignContinent(name: string): Continent {
  const text = normalizeName(name);
  let best: { continent: Continent; at: number } | null = null;
  for (const { continent, pattern } of MATCHERS) {
    const match = pattern.exec(text);
    if (match && (!best || match.index < best.at)) {
      best = { continent, at: match.index };
    }
  }
  return best?.continent ?? "general";
}

/** Hebrew geresh and gershayim typed as ASCII quotes, so both spellings match. */
function normalizeName(name: string): string {
  return name.replace(/[׳’`]/g, "'").replace(/[״”]/g, '"');
}

/** `value` with regular-expression metacharacters escaped. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
