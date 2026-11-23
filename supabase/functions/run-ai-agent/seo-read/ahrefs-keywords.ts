import { numberOrNull } from "./numbers.ts";

/** A keyword row as fetch-ahrefs-snapshot stores it. */
type StoredKeyword = {
  keyword: string;
  position: number | null;
  positionPrev: number | null;
  traffic: number;
  volume: number | null;
  kd: number | null;
  url: string;
};

/** Stored keyword rows, skipping entries without a keyword. */
function keywordRows(rows: Array<unknown>): Array<StoredKeyword> {
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== "object") {
      return [];
    }
    const row = raw as Record<string, unknown>;
    if (typeof row.keyword !== "string" || !row.keyword.trim()) {
      return [];
    }
    return [
      {
        keyword: row.keyword,
        position: numberOrNull(row.position ?? row.best_position),
        positionPrev: numberOrNull(row.position_prev_month),
        traffic: numberOrNull(row.traffic) ?? 0,
        volume: numberOrNull(row.volume),
        kd: numberOrNull(row.kd),
        url: typeof row.url === "string" ? row.url : "",
      },
    ];
  });
}

/** The organic keywords bringing the most traffic. */
export function topOrganicKeywords(rows: Array<unknown>, topN: number) {
  return keywordRows(rows)
    .sort((a, b) => b.traffic - a.traffic)
    .slice(0, topN)
    .map((k) => ({
      keyword: k.keyword,
      position: k.position,
      traffic: k.traffic,
      volume: k.volume,
      difficulty: k.kd,
      url: k.url || null,
    }));
}

/** Pages by the organic traffic of their keywords, with their best keyword. */
export function topPages(rows: Array<unknown>, topN: number) {
  const pages = new Map<
    string,
    { traffic: number; keywords: number; best: StoredKeyword }
  >();
  for (const k of keywordRows(rows)) {
    if (!k.url) {
      continue;
    }
    const page = pages.get(k.url);
    if (!page) {
      pages.set(k.url, { traffic: k.traffic, keywords: 1, best: k });
      continue;
    }
    page.traffic += k.traffic;
    page.keywords += 1;
    if (k.traffic > page.best.traffic) {
      page.best = k;
    }
  }
  return [...pages.entries()]
    .sort((a, b) => b[1].traffic - a[1].traffic)
    .slice(0, topN)
    .map(([url, page]) => ({
      url,
      traffic: page.traffic,
      keywords: page.keywords,
      top_keyword: page.best.keyword,
    }));
}

/**
 * Rank-tracker keywords: how many, how many in the top 3 / top 10, and the
 * biggest movers against last month (+ = improved).
 */
export function trackedSummary(rows: Array<unknown>, topN: number) {
  const tracked = keywordRows(rows);
  if (!tracked.length) {
    return null;
  }
  const ranked = tracked.filter((k) => k.position !== null && k.position >= 1);
  const movers = tracked
    .filter((k) => k.position !== null && k.positionPrev !== null)
    .map((k) => ({
      keyword: k.keyword,
      position: k.position,
      position_change: (k.positionPrev ?? 0) - (k.position ?? 0),
    }))
    .sort((a, b) => Math.abs(b.position_change) - Math.abs(a.position_change))
    .slice(0, topN);
  return {
    count: tracked.length,
    ranked: ranked.length,
    top3: ranked.filter((k) => (k.position ?? 99) <= 3).length,
    top10: ranked.filter((k) => (k.position ?? 99) <= 10).length,
    biggest_movers: movers,
  };
}
