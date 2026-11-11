import type { DbClient } from "../_shared/supabase-clients.ts";
/**
 * The pulse's report tables per client, split by `crm_tables.campaign_active`
 * (AIO-501): active tables feed the campaign numbers and alerts; switched-off
 * tables are read only for their recent spend (report_off_spending).
 */
import { fetchCampaignLevelRecords } from "../_shared/ads-sync/campaign-records.ts";
import { isRecord } from "../_shared/ads-sync/is-record.ts";
import { getSpendFromData } from "../_shared/campaign-goal/ads-metrics.ts";
import { reportCampaignKey } from "../_shared/campaign-goal/campaign-goals.ts";
import type { OffReportSpend } from "../_shared/pulse/report-off-spending.ts";
import { recordsThrough } from "./client-windows.ts";

/** The crm_tables columns the split and the spend read need. */
export type PulseReportTable = {
  id: string;
  client_id: string | null;
  name?: string | null;
  campaign_active?: boolean | null;
};

/** The client's tables, by whether their campaigns are switched on. */
export type ClientReportTables<T> = {
  activeByClient: Map<string, Array<T>>;
  offByClient: Map<string, Array<T>>;
};

/**
 * Splits the tables the pulse reads for `belongs` (the client is processed and
 * the table matches its services) into active and switched-off, per client.
 * A switched-off table never lands among the active ones.
 */
export function splitReportTables<T extends PulseReportTable>(
  tables: Array<T>,
  belongs: (table: T) => boolean,
): ClientReportTables<T> {
  const activeByClient = new Map<string, Array<T>>();
  const offByClient = new Map<string, Array<T>>();
  for (const table of tables) {
    if (!table.client_id || !belongs(table)) {
      continue;
    }
    const target =
      table.campaign_active === false ? offByClient : activeByClient;
    target.set(table.client_id, [
      ...(target.get(table.client_id) || []),
      table,
    ]);
  }

  return { activeByClient, offByClient };
}

/**
 * Each switched-off table's campaign-level spend from `window.start` through
 * `window.end` (Israel days, the last 3 full days), only for tables that
 * spent. A campaign an active table of the client also reports in the window
 * (an old report switched off, a new one on the same account) is left out:
 * the active report already covers it. Throws on a read error
 * (fetchCampaignLevelRecords) so the caller logs it instead of reporting no
 * spend.
 */
export async function loadOffReportSpend(
  client: DbClient,
  offTables: Array<PulseReportTable>,
  window: { start: string; end: string },
  activeRecords: Array<{ data?: unknown }>,
): Promise<Array<OffReportSpend>> {
  if (!offTables.length) {
    return [];
  }
  const records = await fetchCampaignLevelRecords(client, {
    tableIds: offTables.map((table) => table.id),
    sinceYmd: window.start,
  });
  const covered = campaignKeysInWindow(activeRecords, window);
  const spendByTable = new Map<string, number>();
  for (const row of inWindow(records, window)) {
    const key = isRecord(row.data) ? coverageKey(row.data) : null;
    if (key && covered.has(key)) {
      continue;
    }
    spendByTable.set(
      row.table_id,
      (spendByTable.get(row.table_id) || 0) + getSpendFromData(row.data),
    );
  }

  return offTables.flatMap((table) => {
    const spend = Math.round((spendByTable.get(table.id) || 0) * 100) / 100;
    if (spend <= 0) {
      return [];
    }
    return [
      {
        table_id: table.id,
        table_name: table.name?.trim() || "דוח ללא שם",
        spend_3d: spend,
        window_start: window.start,
        window_end: window.end,
      },
    ];
  });
}

/** The campaign keys of rows in the window that name their campaign. */
function campaignKeysInWindow(
  rows: Array<{ data?: unknown }>,
  window: { start: string; end: string },
): Set<string> {
  const keys = new Set<string>();
  for (const row of inWindow(rows, window)) {
    const key = isRecord(row.data) ? coverageKey(row.data) : null;
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * A row's campaign key (id, else name: reportCampaignKey), or null for a row
 * that names no campaign: reportCampaignKey's "ללא שם" placeholder would match
 * any other nameless row and hide real spend.
 */
function coverageKey(data: Record<string, unknown>): string | null {
  const named = data.campaign_id || data.campaign_name || data.campaign;
  return named ? reportCampaignKey(data) : null;
}

/**
 * Rows dated in the window. Today's partial day is left out in code, like
 * recordsThrough: a stored date may carry a time, which a string bound on the
 * query would misplace.
 */
function inWindow<T extends { data?: unknown }>(
  rows: Array<T>,
  window: { start: string; end: string },
): Array<T> {
  return recordsThrough(rows, window.end).filter((row) => {
    const date = isRecord(row.data) ? row.data.date : undefined;
    return typeof date === "string" && date.slice(0, 10) >= window.start;
  });
}
