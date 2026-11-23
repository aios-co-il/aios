import type { AgentDatabaseClient } from "../database-contracts.ts";

/** Reads the same latest uncleared override for each pulse client. */
export async function loadPulseManualOverrides(
  supabase: AgentDatabaseClient,
  tenantId: string,
  pulseClientIds: Array<string>,
) {
  if (!pulseClientIds.length) {
    return [];
  }
  const { data: overrideRows } = await supabase
    .from("campaign_pulse_overrides")
    .select(
      "client_id, algorithm_status, override_status, reason, algorithm_flags, algorithm_metrics, created_at, clients(name)",
    )
    .eq("tenant_id", tenantId)
    .in("client_id", pulseClientIds)
    .is("cleared_at", null)
    .order("created_at", { ascending: false });
  const seen = new Set<string>();
  return (overrideRows || [])
    .filter((row) => {
      if (seen.has(row.client_id)) {
        return false;
      }
      seen.add(row.client_id);
      return true;
    })
    .map((row) => ({
      client_id: row.client_id,
      client_name: row.clients?.name || null,
      algorithm_status: row.algorithm_status,
      override_status: row.override_status,
      reason: row.reason,
      algorithm_flags: row.algorithm_flags || [],
      algorithm_metrics: row.algorithm_metrics || {},
      corrected_at: row.created_at,
    }));
}
