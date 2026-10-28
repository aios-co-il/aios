/** Sending one pulse instant alert and logging who got it (AIO-226). */
import type {
  PulseInstantAlertCandidate,
  QueueWhatsApp,
} from "../pulse-instant-alerts.ts";
import type { DbClient } from "../supabase-clients.ts";

/**
 * Queues the alert to each phone and logs the phones whose send was queued;
 * returns those phones. Only queued phones go in the log, because another
 * org's dedupe drops the phones it reads there (cross-tenant-recipients.ts).
 */
export async function queueAndLogInstantAlert(
  input: {
    supabase: Pick<DbClient, "from">;
    tenantId: string;
    queueWhatsApp: QueueWhatsApp;
  },
  candidate: PulseInstantAlertCandidate,
  phones: string[],
): Promise<string[]> {
  const queuedPhones: string[] = [];
  for (const phone of phones) {
    if (await input.queueWhatsApp(candidate.message, phone)) {
      queuedPhones.push(phone);
    }
  }
  if (queuedPhones.length) {
    await logInstantAlert(input, candidate, queuedPhones);
  }
  return queuedPhones;
}

/**
 * The pulse_instant_alert_log row dedupe reads, for `phones`, which received
 * `candidate.message` (its own text, or the summary that listed it). A failed
 * insert is logged, and the next run then resends.
 */
export async function logInstantAlert(
  input: { supabase: Pick<DbClient, "from">; tenantId: string },
  candidate: PulseInstantAlertCandidate,
  phones: string[],
): Promise<void> {
  const { error } = await input.supabase
    .from("pulse_instant_alert_log")
    .insert({
      tenant_id: input.tenantId,
      client_id: candidate.client_id,
      rule_type: candidate.rule_type,
      message: candidate.message,
      recipient_phone: joinRecipientPhones(phones),
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
