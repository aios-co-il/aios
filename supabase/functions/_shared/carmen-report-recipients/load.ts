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
 * listed phones that now belong to a client, for one tenant. A list nobody on
 * it can receive is logged as a warning naming the tenant.
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
    return {
      recipients: [],
      skipped: [],
      listUnreachable: false,
      error: error.message,
    };
  }
  const resolved = resolveCarmenReportRecipients({
    configured: configured.data ?? [],
    staff: staff.data ?? [],
    clientPhones: clientPhones.data ?? [],
  });
  if (resolved.listUnreachable) {
    warnListUnreachable(tenantId, resolved);
  }
  return { ...resolved, error: null };
}

/** Names the tenant and why each listed entry was skipped; phones stay out of the log. */
function warnListUnreachable(
  tenantId: string,
  resolved: CarmenReportRecipients,
): void {
  console.warn(
    "[carmen-report-recipients] no listed recipient is reachable; reporting to the owners",
    {
      tenantId,
      skipped: resolved.skipped.map((row) => row.reason),
      owners: resolved.recipients.length,
    },
  );
}

export type LoadedReportRecipients = CarmenReportRecipients & {
  error: string | null;
};
