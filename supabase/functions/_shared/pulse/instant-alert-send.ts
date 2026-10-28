/** Sending one pulse instant alert and logging who got it (AIO-226). */
import type {
  PulseInstantAlertCandidate,
  QueueWhatsApp,
} from "../pulse-instant-alerts.ts";
import type { DbClient } from "../supabase-clients.ts";

/**
 * Queues the alert to each recipient and logs the phones whose send was
 * queued; true when at least one was. Only queued phones go in the log,
 * because another org's dedupe drops the phones it reads there
 * (cross-tenant-recipients.ts). A failed log insert is logged, and the next
 * run then resends.
 */
export async function queueAndLogInstantAlert(
  input: {
    supabase: Pick<DbClient, "from">;
    tenantId: string;
    queueWhatsApp: QueueWhatsApp;
  },
  candidate: PulseInstantAlertCandidate,
  recipients: Array<{ phone: string }>,
): Promise<boolean> {
  const queuedPhones: string[] = [];
  for (const recipient of recipients) {
    if (await input.queueWhatsApp(candidate.message, recipient.phone)) {
      queuedPhones.push(recipient.phone);
    }
  }
  if (!queuedPhones.length) {
    return false;
  }
  const { error } = await input.supabase
    .from("pulse_instant_alert_log")
    .insert({
      tenant_id: input.tenantId,
      client_id: candidate.client_id,
      rule_type: candidate.rule_type,
      message: candidate.message,
      recipient_phone: joinRecipientPhones(queuedPhones),
      campaign_key: candidate.campaign_key || null,
      fingerprint: candidate.fingerprint || null,
      severity_score: candidate.severity_score || null,
      evidence: candidate.evidence || {},
    });
  if (error) {
    console.error(
      "[pulse-instant-alerts] alert log insert failed; the next run resends",
      error.message,
    );
  }
  return true;
}

/** pulse_instant_alert_log.recipient_phone: the phones, comma-joined. */
export function joinRecipientPhones(phones: string[]): string {
  return phones.join(",");
}

/** The phones a pulse_instant_alert_log.recipient_phone value lists. */
export function splitRecipientPhones(value: string | null): string[] {
  return (value || "")
    .split(",")
    .map((phone) => phone.trim())
    .filter(Boolean);
}
