/**
 * The Sunday health digest goes to everyone the organization's Carmen reports
 * to (carmen_report_recipients, else its owners), like the pulse digest. With
 * nobody resolved it keeps claude-notify's own staff chain, as before AIO-260.
 */

import { queueToReportRecipients } from "../_shared/carmen-report-recipients/deliver.ts";
import {
  loadCarmenReportRecipients,
  warnListUnreachable,
} from "../_shared/carmen-report-recipients/load.ts";
import type { CarmenReportRecipient } from "../_shared/carmen-report-recipients/resolve.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** Queues the digest to each report recipient; sent when any was queued. */
export async function deliverHealthDigest(
  supabase: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  digest: string,
): Promise<{ sent: boolean; error?: string }> {
  const report = await loadCarmenReportRecipients(supabase, tenantId);
  if (report.error) {
    return { sent: false, error: report.error };
  }
  warnListUnreachable("carmen-health-probe", tenantId, report);
  const queued = report.recipients.length
    ? await queueToEveryRecipient(supabase, tenantId, report.recipients, digest)
    : await queueHealthDigest(supabase, tenantId, digest, null);
  return queued
    ? { sent: true }
    : { sent: false, error: "claude_notify_david queued nothing" };
}

/** One notify per report recipient; true when any was queued. */
async function queueToEveryRecipient(
  supabase: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  recipients: CarmenReportRecipient[],
  digest: string,
): Promise<boolean> {
  const deliveries = await queueToReportRecipients(
    recipients,
    digest,
    (message, phone) => queueHealthDigest(supabase, tenantId, message, phone),
  );
  return deliveries.some((row) => row.queued);
}

/**
 * One private WhatsApp through claude-notify; logs and returns false on
 * failure. Without a phone (no p_chat_id) claude-notify picks the tenant's
 * staff chat.
 */
async function queueHealthDigest(
  supabase: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  message: string,
  phone: string | null,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("claude_notify_david", {
    p_message: message,
    p_tenant: tenantId,
    ...(phone ? { p_chat_id: phone } : {}),
  });
  if (error) {
    console.error(
      "[carmen-health-probe] claude_notify_david failed",
      tenantId,
      error.message,
    );
    return false;
  }
  return isQueued(data);
}

/** claude_notify_david returns jsonb `{ queued: true, request_id }`. */
function isQueued(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "queued" in data &&
    data.queued === true
  );
}
