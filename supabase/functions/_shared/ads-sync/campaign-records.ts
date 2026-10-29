/**
 * Complete reads of the ads report rows in crm_records. PostgREST returns at most
 * max_rows per request, so a single request silently truncates a large table.
 */
import type { Tables } from "../database.types.ts";
import { isRecord } from "./is-record.ts";

/** Campaign-level rows; a row without `entity_level` is a campaign row. */
export const CAMPAIGN_LEVEL_FILTER =
  "data->>entity_level.is.null,data->>entity_level.eq.campaign";

/** PostgREST returns at most max_rows (1000 on Supabase) per request. */
export const CRM_RECORDS_PAGE_SIZE = 1000;

/**
 * A row as the readers return it. `data` is plain jsonb, so it is checked on
 * read: the stored object, or null when the column holds anything else.
 */
export type CrmRecordRow = Pick<Tables<"crm_records">, "id" | "table_id"> & {
  data: Record<string, unknown> | null;
};

type PageResult = PromiseLike<{
  data: unknown;
  error: { message?: string } | null;
}>;
type RecordsQuery = {
  eq(column: string, value: string): RecordsQuery;
  in(column: string, values: readonly string[]): RecordsQuery;
  or(filter: string): RecordsQuery;
  gte(column: string, value: string): RecordsQuery;
  lte(column: string, value: string): RecordsQuery;
  order(column: string, options?: { ascending?: boolean }): RecordsQuery;
  range(from: number, to: number): PageResult;
};
export type RecordsClient = {
  from(table: string): { select(columns: string): RecordsQuery };
};

const COLUMNS = "id, table_id, data";

/**
 * Every campaign-level crm_records row of `tableIds` dated from `sinceYmd`,
 * page by page in a stable order. Throws on a read error instead of returning
 * a silently partial set.
 */
export async function fetchCampaignLevelRecords(
  client: RecordsClient,
  input: {
    tableIds: readonly string[];
    sinceYmd: string;
    untilYmd?: string;
    tenantIds?: readonly string[];
    pageSize?: number;
  },
): Promise<CrmRecordRow[]> {
  if (!input.tableIds.length) {
    return [];
  }
  return await fetchAllPages(() => {
    let query = client
      .from("crm_records")
      .select(COLUMNS)
      .in("table_id", input.tableIds)
      .or(CAMPAIGN_LEVEL_FILTER)
      .gte("data->>date", input.sinceYmd);
    if (input.untilYmd) {
      query = query.lte("data->>date", input.untilYmd);
    }
    if (input.tenantIds?.length) {
      query = query.in("tenant_id", input.tenantIds);
    }
    return query;
  }, input.pageSize);
}

/** Every crm_records row of one table (any level or date), paged the same way. */
export async function fetchTableRecords(
  client: RecordsClient,
  tableId: string,
  pageSize?: number,
): Promise<CrmRecordRow[]> {
  return await fetchAllPages(
    () => client.from("crm_records").select(COLUMNS).eq("table_id", tableId),
    pageSize,
  );
}

/** Reads `query` page by page in id order until a short page; throws on a read error. */
async function fetchAllPages(
  query: () => RecordsQuery,
  pageSize?: number,
): Promise<CrmRecordRow[]> {
  const size = pageSize || CRM_RECORDS_PAGE_SIZE;
  const rows: CrmRecordRow[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await query()
      .order("id", { ascending: true })
      .range(from, from + size - 1);
    if (error) {
      throw new Error(`crm_records read failed: ${error.message || "error"}`);
    }
    const page = (Array.isArray(data) ? data : []).map(parseCrmRecordRow);
    for (const row of page) {
      if (!row) {
        throw new Error("crm_records read failed: unexpected row shape");
      }
      rows.push(row);
    }
    if (page.length < size) {
      return rows;
    }
  }
}

/** The columns every reader selects (COLUMNS), or null when one is missing. */
function parseCrmRecordRow(value: unknown): CrmRecordRow | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.table_id !== "string" ||
    !("data" in value)
  ) {
    return null;
  }
  return {
    id: value.id,
    table_id: value.table_id,
    data: isRecord(value.data) ? value.data : null,
  };
}
