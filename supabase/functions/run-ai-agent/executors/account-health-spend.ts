import type { ToolExecutionContext } from "../tool-context.ts";
import type { MetaAdSettings } from "../tool-storage-contracts.ts";
import { readMetaAdSettings } from "../tool-storage-contracts.ts";
import { fetchCampaignLevelRecords } from "../../_shared/ads-sync/campaign-records.ts";

/** Loads and counts the same campaign-level records after Meta status lookup. */
export async function loadAccountHealthSpend(
  clientIds: Array<string>,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;
  const db = supabase;
  const now = new Date();
  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 7);
  const d7Str = d7.toISOString().split("T")[0];
  const tableIdsForRecords = await db
    .from("crm_tables")
    .select("id, client_id, integration_settings")
    .in("client_id", clientIds)
    .in("tenant_id", accessibleTenantIds)
    .eq("integration_type", "facebook_insights");
  const tableIdToClient = new Map<string, string | null>();
  const settingsByClient = new Map<string | null, MetaAdSettings>();
  for (const t of tableIdsForRecords.data || []) {
    tableIdToClient.set(t.id, t.client_id);
    settingsByClient.set(
      t.client_id,
      readMetaAdSettings(t.integration_settings),
    );
  }
  const tableIds = Array.from(tableIdToClient.keys());
  const spendByClient = new Map<
    string,
    { spend7: number; activeCount: number; pausedCount: number }
  >();
  if (tableIds.length > 0) {
    // Campaign-level rows of the last 7 days, paged: one unfiltered request
    // stopped at 1000 rows of any level/date and missed real spend.
    const recs = await fetchCampaignLevelRecords(supabase, {
      tableIds,
      sinceYmd: d7Str,
      tenantIds: accessibleTenantIds,
    });
    for (const r of recs) {
      const cid = tableIdToClient.get(r.table_id);
      if (!cid) {
        continue;
      }
      const cur = spendByClient.get(cid) || {
        spend7: 0,
        activeCount: 0,
        pausedCount: 0,
      };
      const date = r.data?.date;
      if (typeof date === "string" && date >= d7Str) {
        cur.spend7 += parseFloat(String(r.data?.spend)) || 0;
      }
      const eff = String(r.data?.effective_status || "").toUpperCase();
      if (eff === "ACTIVE") {
        cur.activeCount += 1;
      } else if (eff === "PAUSED" || eff === "OFF") {
        cur.pausedCount += 1;
      }
      spendByClient.set(cid, cur);
    }
  }

  return { settingsByClient, spendByClient };
}
