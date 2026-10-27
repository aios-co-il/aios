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
  return { ...resolved, error: null };
}

/**
 * loadCarmenReportRecipients for a notify to one person (claude-notify,
 * manus-notify): a failed read is logged and returned, and the notify keeps
 * its staff session chain.
 */
export async function loadNotifyReportRecipients(
  db: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  sender: string,
): Promise<LoadedReportRecipients> {
  const report = await loadCarmenReportRecipients(db, tenantId);
  if (report.error) {
    console.warn(`[${sender}] report recipients unavailable`, {
      tenantId,
      error: report.error,
    });
  }
  return report;
}

/**
 * Warns when nobody on the tenant's list is reachable. Only the senders that
 * then report to the owners call it (the Sunday digests and instant alerts),
 * and only on a run that reports; a notify keeps the staff chain instead.
 * Phones stay out of the log.
 */
export function warnListUnreachable(
  sender: string,
  tenantId: string,
  resolved: CarmenReportRecipients,
): void {
  if (!resolved.listUnreachable) {
    return;
  }
  console.warn(
    `[${sender}] no listed report recipient is reachable; reporting to the owners`,
    {
      tenantId,
      skipped: resolved.skipped.map((row) => `${row.source}:${row.reason}`),
      owners: resolved.recipients.length,
    },
  );
}

export type LoadedReportRecipients = CarmenReportRecipients & {
  error: string | null;
};
