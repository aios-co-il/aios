import type { Json } from "@/integrations/supabase/types";

/** An Ahrefs / tracked / GSC-only keyword row as merged by the SEO dashboards. */
export type SeoKeywordRow = {
  keyword?: string;
  position?: Json;
  position_prev_month?: Json;
  position_3month?: Json;
  position_yearly?: Json;
  traffic?: Json;
  volume?: Json;
  kd?: Json;
  cpc?: Json;
  url?: Json;
  gsc_clicks?: Json;
  gsc_impressions?: Json;
  gsc_ctr?: Json;
  gsc_position?: Json;
  ahrefs_position?: Json;
  _position_source?: string;
  _source?: string;
  _local_tracked?: boolean;
};

/** Positions gained since `previous` (numeric strings count as numbers). */
export function positionDelta(
  previous: Json | undefined,
  current: Json | undefined,
): number | null {
  return previous != null && current != null
    ? Number(previous) - Number(current)
    : null;
}

export function compareByPosition(a: SeoKeywordRow, b: SeoKeywordRow): number {
  return Number(a.position ?? 999) - Number(b.position ?? 999);
}

const MERGE_FIELDS: (keyof SeoKeywordRow)[] = [
  "position",
  "position_prev_month",
  "position_3month",
  "position_yearly",
  "traffic",
  "volume",
  "kd",
  "cpc",
  "url",
  "gsc_clicks",
  "gsc_impressions",
  "gsc_ctr",
  "_position_source",
  "_source",
];

const isBlankField = (value: unknown) => value == null || value === "";

function fillBlankField<K extends keyof SeoKeywordRow>(
  target: SeoKeywordRow,
  source: SeoKeywordRow,
  key: K,
) {
  if (isBlankField(target[key]) && !isBlankField(source[key])) {
    target[key] = source[key];
  }
}

function compareVariants(a: SeoKeywordRow, b: SeoKeywordRow): number {
  const ap = a.position ?? Number.POSITIVE_INFINITY;
  const bp = b.position ?? Number.POSITIVE_INFINITY;
  if (ap !== bp) return Number(ap) - Number(bp);
  const at = Number(a.traffic ?? 0),
    bt = Number(b.traffic ?? 0);
  if (at !== bt) return bt - at;
  return Number(b.volume ?? 0) - Number(a.volume ?? 0);
}

/** One row per keyword: the best-ranked variant, with blanks filled from the others. */
export function dedupeKeywordRows(rows: SeoKeywordRow[]): SeoKeywordRow[] {
  const groups = new Map<string, SeoKeywordRow[]>();
  for (const r of rows) {
    const key = String(r?.keyword || "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((variants) => {
    const sorted = [...variants].sort(compareVariants);
    const best = { ...sorted[0] };
    for (const other of sorted.slice(1)) {
      for (const f of MERGE_FIELDS) fillBlankField(best, other, f);
    }
    return best;
  });
}
