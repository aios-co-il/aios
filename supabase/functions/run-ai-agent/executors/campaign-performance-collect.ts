import type { ToolExecutionContext } from "../tool-context.ts";
import type {
  CampaignTableMatch,
  PerformanceScopeClient,
  RankedPerformanceEntry,
} from "./campaign-performance-types.ts";
import type { readCampaignGoalTables } from "../goal-tables.ts";
import type { DisconnectedClient } from "../helper-results.ts";
import type { CampaignGoalRecord } from "../../_shared/campaign-goal/campaign-goals.ts";
import { fetchCampaignLevelRecords } from "../../_shared/ads-sync/campaign-records.ts";
import { staleClientEntry } from "../stale-client-entry.ts";
import { clientPerformanceEntry } from "../client-performance.ts";
import { errorMessage } from "../error-message.ts";

/** Collects each client sequentially and preserves failed/stale-record fallback. */
export async function collectCampaignPerformance(
  context: ToolExecutionContext,
  input: {
    targetClients: Array<PerformanceScopeClient>;
    tablesByClient: Map<string, Array<CampaignTableMatch>>;
    goalTableById: Awaited<ReturnType<typeof readCampaignGoalTables>>;
    d7Str: string;
    d30Str: string;
    now: Date;
  },
) {
  const { supabase, accessibleTenantIds } = context;
  const { targetClients, tablesByClient, goalTableById, d7Str, d30Str, now } =
    input;
  const synced_clients: Array<RankedPerformanceEntry> = [];
  const not_connected_clients: Array<DisconnectedClient> = [];

  for (const client of targetClients || []) {
    const tables = tablesByClient.get(client.id) || [];
    if (tables.length === 0) {
      not_connected_clients.push({
        client_id: client.id,
        client_name: client.name,
        reason: "no_campaign_table",
      });
      continue;
    }

    const tableIds: Array<string> = tables.map(
      (t: { table_id: string }) => t.table_id,
    );
    // Campaign-level rows only, as the reports count them (ad set and ad
    // rows repeat the campaign's spend and results), paged past 1000 rows.
    let records: Array<CampaignGoalRecord>;
    try {
      records = await fetchCampaignLevelRecords(supabase, {
        tableIds,
        sinceYmd: d30Str,
        tenantIds: accessibleTenantIds,
      });
    } catch (err) {
      console.warn(
        `[analyze_campaign_performance] ${client.id}: ${errorMessage(err)}`,
      );
      synced_clients.push(staleClientEntry(client, true));
      continue;
    }

    // Tables exist = connected. Empty/stale sync is attention, not "not connected".
    if (records.length === 0) {
      synced_clients.push(staleClientEntry(client));
      continue;
    }

    synced_clients.push(
      clientPerformanceEntry({
        client,
        records,
        tables: tableIds.flatMap((id) => {
          const table = goalTableById.get(id);
          return table ? [table] : [];
        }),
        d7Str,
        now,
      }),
    );
  }
  return { synced_clients, not_connected_clients };
}
