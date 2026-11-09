import type { GetLatestCampaignPulseArgs } from "./pulse-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { PulseCacheRow } from "./pulse-cache-types.ts";
import { normalizePulseRowClientCall } from "../../_shared/pulse/client-call.ts";
import { filterPulseRowsByClientIds } from "../../_shared/campaign-pulse.ts";

/** Loads and scopes the freshest cached pulse without changing fallback order. */
export async function loadPulseCacheRows(
  args: GetLatestCampaignPulseArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    callerCampaignerId,
    callerManagedAgencyIds,
    accessibleTenantIds,
    bypassCampaignerScope,
  } = context;
  const PULSE_BASE_COLUMNS =
    "tenant_id, calculated_at, data_fresh_through, status, campaign_goal_mode, is_ecommerce, spend_7d, lead_spend_7d, ecommerce_spend_7d, leads_7d, cpl_7d, cpl_change_pct, purchases_7d, revenue_7d, roas_7d, roas_change_pct, lead_goal_status, ecommerce_goal_status, flags, source, last_meta_change_at, last_meta_change_type, last_meta_change_actor, last_meta_change_object, meta_change_availability, client_id, agency_id, clients(name), agencies(name)";
  const PULSE_CALL_COLUMNS = "last_client_call_at, last_client_call_by";
  const PULSE_CAMPAIGN_COLUMNS = "campaign_breakdown";
  /** Reads the same projection with the original optional-column fallbacks. */
  async function loadPulse(columns: string) {
    let query = supabase
      .from("campaign_pulse_snapshots")
      .select(columns)
      // Shared agencies may snapshot under a partner tenant — same scope as the dashboard.
      .in("tenant_id", accessibleTenantIds)
      .order("calculated_at", { ascending: false });
    if (args.client_id) {
      query = query.eq("client_id", args.client_id);
    }
    if (args.agency_id) {
      query = query.eq("agency_id", args.agency_id);
    }
    if (callerManagedAgencyIds && callerManagedAgencyIds.length > 0) {
      query = query.in("agency_id", callerManagedAgencyIds);
    }
    return await query.returns<Array<PulseCacheRow>>();
  }
  let { data, error } = await loadPulse(
    `${PULSE_BASE_COLUMNS}, ${PULSE_CALL_COLUMNS}, ${PULSE_CAMPAIGN_COLUMNS}`,
  );
  if (error && /campaign_breakdown/.test(error.message)) {
    // Campaign breakdown not deployed yet — serve the client-level pulse.
    ({ data, error } = await loadPulse(
      `${PULSE_BASE_COLUMNS}, ${PULSE_CALL_COLUMNS}`,
    ));
  }
  if (error && /last_client_call/.test(error.message)) {
    // Call-freshness columns not deployed yet — still serve the pulse.
    ({ data, error } = await loadPulse(PULSE_BASE_COLUMNS));
  }
  if (error) {
    throw error;
  }
  let rows = data || [];
  if (args.client_name) {
    const needle = String(args.client_name).toLocaleLowerCase("he");
    rows = rows.filter((row) =>
      String(row.clients?.name || "")
        .toLocaleLowerCase("he")
        .includes(needle),
    );
  }
  if (args.agency_name) {
    const needle = String(args.agency_name).toLocaleLowerCase("he");
    rows = rows.filter((row) =>
      String(row.agencies?.name || "")
        .toLocaleLowerCase("he")
        .includes(needle),
    );
  }
  // One row per client: partner tenants can hold a snapshot for the same client.
  const freshestByClient = new Map<string, PulseCacheRow>();
  for (const row of rows) {
    const previous = freshestByClient.get(row.client_id);
    if (
      !previous ||
      String(row.calculated_at || "") > String(previous.calculated_at || "")
    ) {
      freshestByClient.set(row.client_id, row);
    }
  }
  // Status is performance-only; no_recent_client_call is the separate contact flag (AIO-227).
  // Filter status here, not in SQL: a legacy call-only warning reads as healthy only after normalising.
  let normalizedRows = Array.from(freshestByClient.values())
    .map((row) =>
      normalizePulseRowClientCall({
        ...row,
        client_name: row.clients?.name || null,
        agency_name: row.agencies?.name || null,
        clients: undefined,
        agencies: undefined,
      }),
    )
    .filter((row) => !args.status || row.status === args.status);
  // Campaigners (WhatsApp / in-app) see only clients assigned via client_team.
  if (callerCampaignerId && !bypassCampaignerScope) {
    const { data: links, error: linksError } = await supabase
      .from("client_team")
      .select("client_id")
      .eq("campaigner_id", callerCampaignerId);
    if (linksError) {
      throw linksError;
    }
    const assignedClientIds = (links || [])
      .map((link) => link.client_id)
      .filter(Boolean);
    normalizedRows = filterPulseRowsByClientIds(
      normalizedRows,
      assignedClientIds,
    );
  }

  return normalizedRows;
}
