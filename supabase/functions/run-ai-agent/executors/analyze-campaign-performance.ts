import { loadCampaignPerformanceScope } from "./campaign-performance-scope.ts";
import { collectCampaignPerformance } from "./campaign-performance-collect.ts";
import type { CampaignTableMatch } from "./campaign-performance-types.ts";
import type { AnalyzeCampaignPerformanceArgs } from "./pulse-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { readCampaignGoalTables } from "../goal-tables.ts";

import { fbTryConnectClients } from "./meta-connect-clients.ts";

/** Preserves the existing analyze_campaign_performance executor and side-effect order. */
export async function executeAnalyzeCampaignPerformance(
  args: AnalyzeCampaignPerformanceArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  // 1. Resolve scope -> list of target clients (active+onboarding)
  const loadedScope = await loadCampaignPerformanceScope(args, context);
  if ("empty" in loadedScope) {
    return loadedScope.empty;
  }
  const { targetClients, agencyIdsFilter, agencyNameLabel } = loadedScope.scope;
  const clientIds = (targetClients || []).map((c) => c.id);
  if (clientIds.length === 0) {
    return {
      scope: { agency_name: agencyNameLabel, total_active_clients: 0 },
      coverage_summary: { synced: 0, not_connected: 0 },
      synced_clients: [],
      not_connected_clients: [],
    };
  }

  // 2. Find campaign tables by SCHEMA (spend + campaign_name/id), not by slug
  const { data: campaignTables, error: rpcErr } = await supabase.rpc(
    "find_campaign_tables",
    { p_client_ids: clientIds },
  );
  if (rpcErr) {
    throw rpcErr;
  }

  const tablesByClient = new Map<string, Array<CampaignTableMatch>>();
  for (const t of campaignTables || []) {
    const arr = tablesByClient.get(t.client_id) || [];
    arr.push(t);
    tablesByClient.set(t.client_id, arr);
  }
  // Each table's goal settings: the reports judge a campaign by its table.
  const campaignTableIds = (campaignTables || []).map(
    (t: { table_id: string }) => t.table_id,
  );
  const goalTableById = await readCampaignGoalTables(
    supabase,
    campaignTableIds,
  );

  // 3. Compute metrics for each client that has tables
  const now = new Date();
  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 7);
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const d7Str = d7.toISOString().split("T")[0];
  const d30Str = d30.toISOString().split("T")[0];

  const { synced_clients, not_connected_clients } =
    await collectCampaignPerformance(context, {
      targetClients,
      tablesByClient,
      goalTableById,
      d7Str,
      d30Str,
      now,
    });

  synced_clients.sort(
    (a, b) => (b.spend_change_pct || 0) - (a.spend_change_pct || 0),
  );

  // Try-to-connect pass: for every client we couldn't report from synced data,
  // attempt a LIVE pull straight from Meta. Connects mapped-but-stale clients via
  // their config and truly-unmapped clients via a strong name match — so "not
  // connected" becomes real live numbers wherever possible, and whatever still
  // can't connect is surfaced explicitly (never silently dropped, never faked).
  const {
    connected: newly_connected_clients,
    stillNotConnected: still_not_connected_clients,
  } =
    not_connected_clients.length > 0
      ? await fbTryConnectClients(
          supabase,
          accessibleTenantIds[0],
          not_connected_clients,
          7,
        )
      : { connected: [], stillNotConnected: [] };

  const hasNameMatch = newly_connected_clients.some(
    (c) => c.matched_by === "name",
  );

  return {
    scope: {
      agency_name: agencyNameLabel,
      agency_ids: agencyIdsFilter,
      client_id: args.client_id || null,
      total_active_clients: targetClients?.length || 0,
    },
    coverage_summary: {
      synced: synced_clients.length,
      connected_live: newly_connected_clients.length,
      still_not_connected: still_not_connected_clients.length,
    },
    // Portfolio trend scan runs off the synced CRM tables (needs the daily history for the
    // 7d-vs-prior comparison). For live, up-to-the-minute status/leads on a single client use
    // get_facebook_campaign_data / list_facebook_campaigns (source: 'live_meta'). Per-client
    // `last_data_date` shows how fresh each row is.
    data_source: "synced_crm+live_meta",
    synced_clients,
    // Clients that had no synced data but we connected LIVE this run (7d window).
    // matched_by:'name' means auto-matched by name — needs human verification.
    newly_connected_clients,
    // Clients we still couldn't connect — these need manual linking; tell the user.
    still_not_connected_clients,
    instructions_to_agent:
      "דווחי על שלושת הסלוטים: synced_clients (היסטורי), newly_connected_clients (משכתי חי עכשיו) ו-still_not_connected_clients. " +
      'אסור לטעון "אין נתונים" כשיש נתונים. עבור newly_connected_clients הציגי את המספרים החיים (spend/leads/CPL ל-7 ימים). ' +
      (hasNameMatch
        ? 'חלק מהלקוחות חוברו לפי התאמת שם (matched_by="name") — ציַני זאת במפורש לדויד ובקשי אישור שהחשבון נכון לפני שמסתמכים על המספרים. '
        : "") +
      (still_not_connected_clients.length > 0
        ? "עבור still_not_connected_clients — נסיתי לחבר אוטומטית ולא הצלחתי; אמרי לדויד במפורש אילו לקוחות לא הצלחתי לחבר ומה הסיבה (connect_attempt), והציעי חיבור ידני. אל תמציאי מספרים עבורם."
        : "כל הלקוחות חוברו (מסונכרן או חי)."),
  };
}
