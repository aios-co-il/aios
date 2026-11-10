import {
  type AdsEntityLevel,
  filterRecordsByEntityLevel,
  getEntityGroupKey,
} from "@/lib/adsEntityLevel";

type ReportRecord = { data: Record<string, unknown> };

/**
 * The previous period's records at the report's level. With a search on, the
 * history kept is that of the entities the search shows now, by their stable
 * key: a campaign renamed since then still compares with its old rows.
 */
export function previousReportRecords<T extends ReportRecord>(
  previous: Array<T>,
  level: AdsEntityLevel,
  options: { searching: boolean; shown: Array<ReportRecord> },
): Array<T> {
  const levelRecords = filterRecordsByEntityLevel(previous, level);
  if (!options.searching) {
    return levelRecords;
  }
  const shownKeys = new Set(
    options.shown.map((record) => getEntityGroupKey(record.data, level)),
  );
  return levelRecords.filter((record) =>
    shownKeys.has(getEntityGroupKey(record.data, level)),
  );
}
