/**
 * Inputs for the client-level campaign pulse: Israel calendar windows and a
 * complete (paginated) read of the campaign-level report rows.
 */
import { jerusalemYmd, shiftYmd } from "./calendarTimeZone.ts";

/**
 * Client-level windows in Asia/Jerusalem full days ending yesterday, matching
 * campaign_breakdown (pulseTrendWindows): today's partial day is never counted.
 */
export function pulseClientWindows(now: Date = new Date()) {
  const today = jerusalemYmd(now);
  const end = shiftYmd(today, -1);
  const current7Start = shiftYmd(end, -6);
  return {
    today,
    /** Last complete day (yesterday in Israel). */
    end,
    current3Start: shiftYmd(end, -2),
    current7Start,
    /** Prior 7 full days: previous7Start .. current7Start - 1. */
    previous7Start: shiftYmd(current7Start, -7),
    /** "Any data lately" check; may include today. */
    recent30Start: shiftYmd(today, -30),
    /** Oldest day any pulse window reads (campaign_breakdown baseline). */
    queryStart: shiftYmd(current7Start, -28),
  };
}

type DatedRow = { data?: { date?: unknown } | null };

/** Rows dated on or before `endYmd` (drops today's partial day). */
export function recordsThrough<T extends DatedRow>(
  rows: T[],
  endYmd: string,
): T[] {
  return rows.filter((row) => {
    const date = row.data?.date;
    return typeof date === "string" && date.slice(0, 10) <= endYmd;
  });
}

/** Campaign-level rows; a row without `entity_level` is a campaign row. */
export const CAMPAIGN_LEVEL_FILTER =
  "data->>entity_level.is.null,data->>entity_level.eq.campaign";

/** PostgREST returns at most max_rows (1000 on Supabase) per request. */
export const CRM_RECORDS_PAGE_SIZE = 1000;

type PageResult = PromiseLike<{
  data: unknown[] | null;
  error: { message?: string } | null;
}>;
type RecordsQuery = {
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

/**
 * Every campaign-level crm_records row of `tableIds` dated from `sinceYmd`,
 * page by page in a stable order. Throws on a read error instead of returning
 * a silently partial set.
 */
export async function fetchCampaignLevelRecords<T = Record<string, unknown>>(
  client: RecordsClient,
  input: {
    tableIds: readonly string[];
    sinceYmd: string;
    untilYmd?: string;
    tenantIds?: readonly string[];
    columns?: string;
    pageSize?: number;
  },
): Promise<T[]> {
  if (!input.tableIds.length) return [];
  const pageSize = input.pageSize || CRM_RECORDS_PAGE_SIZE;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = client
      .from("crm_records")
      .select(input.columns || "id, table_id, data")
      .in("table_id", input.tableIds)
      .or(CAMPAIGN_LEVEL_FILTER)
      .gte("data->>date", input.sinceYmd);
    if (input.untilYmd) query = query.lte("data->>date", input.untilYmd);
    if (input.tenantIds?.length) query = query.in("tenant_id", input.tenantIds);
    const { data, error } = await query
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`crm_records read failed: ${error.message || "error"}`);
    }
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
