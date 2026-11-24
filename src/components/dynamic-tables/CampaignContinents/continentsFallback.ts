/**
 * The tab a dashboard returns to when its continents tab disappears (a period
 * whose campaign names stop naming destinations): Google Ads when the
 * dashboard has it, as before Meta continents existed, otherwise "all", so a
 * Meta-only dashboard never lands on a Google tab it does not have.
 */
export function continentsFallbackFilter(
  availablePlatforms: ReadonlyArray<string>,
): "google_ads" | "all" {
  return availablePlatforms.includes("google_ads") ? "google_ads" : "all";
}
