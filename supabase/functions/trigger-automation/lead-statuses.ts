import type { DbClient } from "../_shared/supabase-clients.ts";
import type { LeadStatuses } from "./status-fanout.ts";

/**
 * A lead's status columns before a "change status" step runs, read inside the
 * run's org. Null when the org has no such lead: nothing fires for it.
 */
export async function leadStatusesBefore(
  supabase: DbClient,
  tenantId: string,
  leadId: string,
): Promise<LeadStatuses | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("status, response_status")
    .eq("tenant_id", tenantId)
    .eq("id", leadId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}
