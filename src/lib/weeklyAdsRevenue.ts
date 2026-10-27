/** Whether a weekly campaign row's conversion value counts as revenue: a lead campaign's (often ₪1 per lead) does not. */
export function earnsRevenue(kind: string): boolean {
  return kind === "ecommerce";
}

/** A week's ROAS over the spend that can earn revenue: lead spend earns none. */
export function weeklyRoas(
  rows: Array<{ kind: string; spend: number }>,
  revenue: number,
): number {
  const spend = rows
    .filter((row) => earnsRevenue(row.kind))
    .reduce((sum, row) => sum + row.spend, 0);
  return spend > 0 ? revenue / spend : 0;
}
