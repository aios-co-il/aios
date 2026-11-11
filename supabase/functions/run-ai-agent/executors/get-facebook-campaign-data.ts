import type { GetFacebookCampaignDataArgs } from "./meta-campaign-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { resolveClientTenantId } from "./client-tenant.ts";
import { fbLiveCampaignInsights } from "./meta-live-insights.ts";
import { fetchCampaignLevelRecords } from "../../_shared/ads-sync/campaign-records.ts";
import { readCampaignGoalTables } from "../goal-tables.ts";
import { storedCampaignRows } from "../campaign-rows.ts";

/** Preserves the existing get_facebook_campaign_data executor and side-effect order. */
export async function executeGetFacebookCampaignData(
  args: GetFacebookCampaignDataArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope } = context;

  if (args.client_id) {
    await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
  }
  const daysBack = args.days || 30;
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);
  const sinceDateStr = sinceDate.toISOString().split("T")[0];

  if (!args.client_id) {
    return { error: "client_id_required", message: "יש להעביר client_id" };
  }

  // LIVE first: pull campaign-level insights straight from Meta (synced tables can lag days/weeks).
  const clientTenantId = await resolveClientTenantId(
    supabase,
    args.client_id,
    accessibleTenantIds[0],
  );
  const liveInsights =
    (await fbLiveCampaignInsights(
      supabase,
      clientTenantId,
      args.client_id,
      daysBack,
    )) ||
    (clientTenantId !== accessibleTenantIds[0]
      ? await fbLiveCampaignInsights(
          supabase,
          accessibleTenantIds[0],
          args.client_id,
          daysBack,
        )
      : null);
  if (liveInsights) {
    return {
      count: liveInsights.length,
      campaigns: liveInsights,
      period: `${daysBack} days`,
      source: "live_meta",
    };
  }

  // Fallback: CRM dynamic tables that hold synced FB insights.
  const { data: campaignTables, error: rpcErr } = await supabase.rpc(
    "find_campaign_tables",
    { p_client_ids: [args.client_id] },
  );
  if (rpcErr) {
    throw rpcErr;
  }
  const tableIds = (campaignTables || []).map((t) => t.table_id);
  if (tableIds.length === 0) {
    return {
      count: 0,
      campaigns: [],
      period: `${daysBack} days`,
      note: "no_campaign_table_for_client",
    };
  }

  // Campaign-level rows only, as the reports count them, paged past 1000 rows.
  const records = await fetchCampaignLevelRecords(supabase, {
    tableIds,
    sinceYmd: sinceDateStr,
    tenantIds: accessibleTenantIds,
  });
  const goalTables = await readCampaignGoalTables(supabase, tableIds);
  const rows = storedCampaignRows(records, [...goalTables.values()]);
  return {
    count: rows.length,
    campaigns: rows,
    period: `${daysBack} days`,
  };
}
