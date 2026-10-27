/**
 * Reads an organization's report list and staff, then resolves whom its
 * Carmen reports to. A failed read returns no recipients with the error, so
 * each caller decides how to record it instead of sending to a guess.
 */

import type { DbClient } from "../supabase-clients.ts";
import {
  resolveCarmenReportRecipients,
  type CarmenReportRecipients,
} from "./resolve.ts";

/**
 * Service-role read of carmen_report_recipients, carmen_report_staff and the
 * listed phones that now belong to a client, for one tenant.
 */
export async function loadCarmenReportRecipients(
  db: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
): Promise<LoadedReportRecipients> {
  const [configured, staff, clientPhones] = await Promise.all([
    db
      .from("carmen_report_recipients")
      .select("user_id, phone, label")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    db.rpc("carmen_report_staff", { p_tenant_id: tenantId }),
    db.rpc("carmen_report_client_phones", { p_tenant_id: tenantId }),
  ]);
  const error = configured.error ?? staff.error ?? clientPhones.error;
  if (error) {
    return { recipients: [], skipped: [], error: error.message };
  }
  return {
    ...resolveCarmenReportRecipients({
      configured: configured.data ?? [],
      staff: staff.data ?? [],
      clientPhones: clientPhones.data ?? [],
    }),
    error: null,
  };
}

export type LoadedReportRecipients = CarmenReportRecipients & {
  error: string | null;
};
