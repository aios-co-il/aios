/**
 * Whether a weekly campaign row's conversion value counts as revenue. A Google
 * lead campaign's does not (often ₪1 per lead); other sources keep their value.
 */
export function earnsRevenue(source: string, kind: string): boolean {
  return source !== "google_ads" || kind === "ecommerce";
}

/** ROAS of one goal's rows in a week, over the spend that can earn revenue: Google lead spend earns none. */
export function weeklyRoas(
  rows: Array<{ source: string; kind: string; spend: number }>,
  revenue: number,
): number {
  const spend = rows
    .filter((row) => earnsRevenue(row.source, row.kind))
    .reduce((sum, row) => sum + row.spend, 0);
  return spend > 0 ? revenue / spend : 0;
}
