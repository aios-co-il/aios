import { CAMPAIGN_ROWS_ONLY_TYPES } from "../_shared/ads-sync/dashboard-rows.ts";
import type { SharedRecordRow } from "./event-totals.ts";

/** The fields of a crm_tables row that pick and tag a share link's records. */
export type SharedRecordTable = {
  id: string;
  name: string;
  integration_type: string | null;
};

/** A record as the link sends it: tagged with its table. */
export type TaggedRecord = SharedRecordRow & {
  _source: string | null;
  _tableId: string;
  _tableName: string;
};

/**
 * Whether the link reads only the rows its dashboards sum from this table
 * (CAMPAIGN_ROWS_ONLY_TYPES): Meta's ad set and ad rows were most of a large
 * link's rows, and no tab reads them.
 */
export function readsCampaignRowsOnly(table: SharedRecordTable): boolean {
  return CAMPAIGN_ROWS_ONLY_TYPES.includes(table.integration_type ?? "");
}

/**
 * Each row tagged with its table. The table's public settings go once, in the
 * answer's `tables`, not on every row: copied onto each row they were the
 * largest part of a large link's answer. The page fills them back on each
 * record (src/components/SharedDashboard/attachTableSettings.ts).
 */
export function tagTableRecords(
  table: SharedRecordTable,
  rows: ReadonlyArray<SharedRecordRow>,
): Array<TaggedRecord> {
  return rows.map((row) => ({
    ...row,
    _source: table.integration_type,
    _tableId: table.id,
    _tableName: table.name,
  }));
}
