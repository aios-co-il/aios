/**
 * analyze-campaign-data's data step: the caller may open the table, then its
 * campaign-level rows of the event windows are read. Every read is injected,
 * so tests run the real access decisions with fakes (AIO-495).
 */
import type { CrmRecordRow } from "../_shared/ads-sync/campaign-records.ts";
import {
  readCallerTable,
  type CallerTable,
  type LoadCallerTable,
} from "./caller-table.ts";
import type { PeriodWindow } from "./event-windows.ts";

export type TableDataDeps = {
  /** The table by id, read as the caller (RLS). */
  loadCallerTable: LoadCallerTable;
  /** Whether the caller may read the table's rows (user_can_access_crm_table); throws on a failed check. */
  callerMayReadRows: (tableId: string) => Promise<boolean>;
  /** The table's campaign-level rows in a date span; throws on a read error. */
  readRecords: (input: {
    tableId: string;
    tenantId: string;
    sinceYmd: string;
    untilYmd: string;
  }) => Promise<Array<CrmRecordRow>>;
  /** Whether the table holds any row at all, to tell an empty span from an empty table. */
  probeRecords: (
    tableId: string,
    tenantId: string,
  ) => PromiseLike<{ data: Array<unknown> | null; error: unknown }>;
};

export type TableDataResult =
  | { ok: true; table: CallerTable; records: Array<CrmRecordRow> }
  | { ok: false; status: 404 | 500; error: string };

const NOT_FOUND = { ok: false, status: 404, error: "Table not found" } as const;

/**
 * The table and its rows when the caller may read them, as the app's own
 * table view decides (RLS on the table, then user_can_access_crm_table, rows
 * under the table's tenant). A table the caller may not read answers the same
 * 404 as a missing one, before any row is read.
 */
export async function loadTableData(
  deps: TableDataDeps,
  tableId: string,
  windows: Array<PeriodWindow>,
): Promise<TableDataResult> {
  const callerTable = await readCallerTable(deps.loadCallerTable, tableId);
  if (!callerTable.ok) {
    return callerTable;
  }
  const { table } = callerTable;
  try {
    if (!(await deps.callerMayReadRows(table.id))) {
      console.warn(
        "[analyze-campaign-data] rows not readable by caller",
        table.id,
      );
      return NOT_FOUND;
    }
  } catch (err) {
    console.error("[analyze-campaign-data] access check failed:", err);
    return { ok: false, status: 500, error: "Failed to check access" };
  }
  const records = await readWindowRecords(deps, table, windows);
  if (records === null) {
    return { ok: false, status: 500, error: "Failed to fetch records" };
  }
  if (records.length > 0) {
    return { ok: true, table, records };
  }
  const probe = await deps.probeRecords(table.id, table.tenant_id);
  if (probe.error) {
    console.error("[analyze-campaign-data] record probe failed:", probe.error);
    return { ok: false, status: 500, error: "Failed to fetch records" };
  }
  if (!probe.data?.length) {
    return { ok: false, status: 404, error: "No records found for this table" };
  }
  return { ok: true, table, records };
}

/** The rows from the earliest window start to the latest window end; null on a read error. */
async function readWindowRecords(
  deps: TableDataDeps,
  table: CallerTable,
  windows: Array<PeriodWindow>,
): Promise<Array<CrmRecordRow> | null> {
  if (windows.length === 0) {
    return [];
  }
  try {
    return await deps.readRecords({
      tableId: table.id,
      tenantId: table.tenant_id,
      sinceYmd: windows.reduce(
        (min, w) => (w.startDate < min ? w.startDate : min),
        windows[0].startDate,
      ),
      untilYmd: windows.reduce(
        (max, w) => (w.endDate > max ? w.endDate : max),
        windows[0].endDate,
      ),
    });
  } catch (err) {
    console.error("[analyze-campaign-data] records read failed:", err);
    return null;
  }
}
