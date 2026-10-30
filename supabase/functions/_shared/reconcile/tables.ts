/**
 * The report tables a check covers and their stored campaign rows (AIO-238).
 * Callers pass a service-role client; scoping to what a person may see is the
 * caller's job.
 */
import type { DbClient } from "../supabase-clients.ts";
import { asRecord } from "./json.ts";
import { isCampaignLevel } from "./metrics.ts";
import { RECONCILE_INTEGRATION_TYPES } from "./run-status.ts";
import type { CampaignDayRow, ListedTable } from "./types.ts";

export const CRM_RECORDS_PAGE_SIZE = 1000;

/** Report tables with an active campaign flag, in id order after `afterId`. */
export async function listReconcileTables(
  db: Pick<DbClient, "from">,
  opts: {
    afterId?: string | null;
    limit: number;
    tenantIds?: string[] | null;
    clientId?: string | null;
    tableIds?: string[] | null;
    integrationTypes?: readonly string[];
  },
): Promise<ListedTable[]> {
  let query = db
    .from("crm_tables")
    .select(TABLE_COLUMNS)
    .in("integration_type", [
      ...(opts.integrationTypes || RECONCILE_INTEGRATION_TYPES),
    ])
    .eq("campaign_active", true);
  if (opts.afterId) {
    query = query.gt("id", opts.afterId);
  }
  if (opts.tenantIds?.length) {
    query = query.in("tenant_id", opts.tenantIds);
  }
  if (opts.clientId) {
    query = query.eq("client_id", opts.clientId);
  }
  if (opts.tableIds?.length) {
    query = query.in("id", opts.tableIds);
  }
  const { data, error } = await query
    .order("id", { ascending: true })
    .limit(opts.limit);
  if (error) {
    throw new Error(`crm_tables: ${error.message}`);
  }
  return (data || []).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    client_id: row.client_id ?? null,
    name: row.name ?? null,
    // Never null here: the query filters on it.
    integration_type: row.integration_type ?? "",
    integration_settings: asRecord(row.integration_settings),
    category: row.category ?? null,
    last_sync_at: row.last_sync_at ?? null,
    client_name: row.clients?.name ?? null,
    client_status: row.clients?.status ?? null,
    agency_name: row.clients?.agencies?.name ?? null,
  }));
}

/**
 * Stored campaign rows for a table and date range, read page by page (PostgREST
 * caps a single response). Rows without entity_level are legacy campaign rows.
 */
export async function readAiosCampaignRows(
  db: Pick<DbClient, "from">,
  tableId: string,
  start: string,
  end: string,
  pageSize = CRM_RECORDS_PAGE_SIZE,
): Promise<CampaignDayRow[]> {
  const rows: CampaignDayRow[] = [];
  for (let page = 0; ; page++) {
    if (page >= MAX_RECORD_PAGES) {
      throw new Error(`crm_records: more than ${MAX_RECORD_PAGES} pages`);
    }
    const from = page * pageSize;
    const { data, error } = await db
      .from("crm_records")
      .select("id, data")
      .eq("table_id", tableId)
      .gte("data->>date", start)
      .lte("data->>date", end)
      .or("data->>entity_level.is.null,data->>entity_level.eq.campaign")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`crm_records: ${error.message}`);
    }
    const batch = data || [];
    for (const rec of batch) {
      const row = campaignDayRow(rec.data);
      if (row) {
        rows.push(row);
      }
    }
    if (batch.length < pageSize) {
      return rows;
    }
  }
}

const MAX_RECORD_PAGES = 200;

const TABLE_COLUMNS =
  "id, tenant_id, client_id, name, integration_type, integration_settings, category, last_sync_at, clients(name, status, agencies(name))";

/** A stored record as a campaign day, or null when it is not a dated campaign row. */
function campaignDayRow(raw: unknown): CampaignDayRow | null {
  const d = asRecord(raw);
  if (!isCampaignLevel(d)) {
    return null;
  }
  const date = String(d.date || "").slice(0, 10);
  if (!date) {
    return null;
  }
  return {
    campaign_id: String(d.campaign_id || ""),
    campaign_name: d.campaign_name ? String(d.campaign_name) : null,
    date,
    data: d,
  };
}
