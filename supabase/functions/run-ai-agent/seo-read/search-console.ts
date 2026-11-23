import type { GscKeywordRow } from "../../_shared/gscKeywords.ts";
import type { SeoClient, SeoDb, SeoToolContext } from "./context.ts";
import { clientRef, nowOf } from "./context.ts";
import { type GscSnapshot, readGscSnapshots } from "./gsc-snapshots.ts";
import { pctChange, round } from "./numbers.ts";

const PERIOD_LABELS: Record<string, string> = {
  current_90d: "90 הימים האחרונים",
  prev_month: "חלון של 28 יום לפני כחודש",
  three_month: "חלון של 28 יום לפני כ-3 חודשים",
  yearly: "חלון של 28 יום לפני כשנה",
};
const PERIOD_ORDER = ["current_90d", "prev_month", "three_month", "yearly"];
const STALE_HOURS = 48;

/**
 * get_search_console_performance: clicks, impressions, CTR and average
 * position per stored window, per-day comparison, top queries with their
 * position change, and "striking distance" queries (position 4–20).
 */
export async function searchConsolePerformance(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
  topN: number,
) {
  const read = await readGscSnapshots(db, ctx, client);
  if ("status" in read) {
    return { client: clientRef(client), connected: false, ...read };
  }
  const byKey = new Map(read.snapshots.map((s) => [s.periodKey, s]));
  const periods = PERIOD_ORDER.flatMap((key) => {
    const snapshot = byKey.get(key);
    return snapshot ? [periodTotals(snapshot)] : [];
  });
  // Freshness is the main 90-day window's; each comparison window shows its own.
  const syncedAt = byKey.get("current_90d")?.syncedAt ?? null;
  const ageHours = syncedAt
    ? (nowOf(ctx).getTime() - new Date(syncedAt).getTime()) / 3_600_000
    : null;
  const currentRows = byKey.get("current_90d")?.rows ?? [];
  const previousRows = byKey.get("prev_month")?.rows ?? [];
  return {
    client: clientRef(client),
    connected: true,
    status: "ok",
    source: "Search Console (סנכרון יומי שמור)",
    site_url: read.siteUrl,
    synced_at: syncedAt,
    stale: ageHours === null || ageHours > STALE_HOURS,
    periods,
    clicks_per_day_change_pct: clicksPerDayChange(
      byKey.get("current_90d"),
      byKey.get("prev_month"),
    ),
    top_queries: topQueries(currentRows, previousRows, topN),
    striking_distance: strikingDistance(currentRows, topN),
    note: "הסכומים לפי שאילתות: גוגל מסתיר שאילתות נדירות, כך שהסה״כ נמוך מעט מהמסך של Search Console. השוואה בין חלונות באורך שונה — לפי ממוצע ליום. נתוני עמודים לא נשמרים בסנכרון.",
  };
}

/** Totals of one window; CTR and position weighted by impressions. */
export function periodTotals(snapshot: GscSnapshot) {
  const days = daysBetween(snapshot.startDate, snapshot.endDate);
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const row of snapshot.rows) {
    clicks += row.clicks || 0;
    impressions += row.impressions || 0;
    weightedPosition += (row.position || 0) * (row.impressions || 0);
  }
  return {
    period: snapshot.periodKey,
    label: PERIOD_LABELS[snapshot.periodKey] ?? snapshot.periodKey,
    start_date: snapshot.startDate,
    end_date: snapshot.endDate,
    days,
    clicks,
    impressions,
    ctr_pct: impressions > 0 ? round((clicks / impressions) * 100, 2) : null,
    avg_position:
      impressions > 0 ? round(weightedPosition / impressions, 1) : null,
    clicks_per_day: round(clicks / days, 1),
    impressions_per_day: round(impressions / days, 1),
    queries: snapshot.rows.length,
    synced_at: snapshot.syncedAt,
  };
}

/** Percent change of clicks per day, from unrounded daily rates. */
function clicksPerDayChange(
  now: GscSnapshot | undefined,
  before: GscSnapshot | undefined,
): number | null {
  return now && before
    ? pctChange(dailyClicks(now), dailyClicks(before))
    : null;
}

/** Clicks per day of a window, unrounded. */
function dailyClicks(snapshot: GscSnapshot): number {
  const clicks = snapshot.rows.reduce((sum, row) => sum + (row.clicks || 0), 0);
  return clicks / daysBetween(snapshot.startDate, snapshot.endDate);
}

/** Most-clicked queries, with position change against a month ago (+ = improved). */
function topQueries(
  rows: Array<GscKeywordRow>,
  previous: Array<GscKeywordRow>,
  topN: number,
) {
  const before = new Map(previous.map((r) => [r.keyword.toLowerCase(), r]));
  return [...rows]
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, topN)
    .map((row) => {
      const old = before.get(row.keyword.toLowerCase());
      return {
        query: row.keyword,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr_pct: row.ctr,
        position: row.position,
        position_change: old?.position
          ? round(old.position - row.position, 1)
          : null,
      };
    });
}

/** Queries ranked 4–20 with the most impressions: the quickest wins. */
function strikingDistance(rows: Array<GscKeywordRow>, topN: number) {
  return rows
    .filter((row) => row.position >= 4 && row.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, topN)
    .map((row) => ({
      query: row.keyword,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
    }));
}

/** Inclusive day count of a window, at least 1. */
function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 86_400_000) + 1) : 1;
}
