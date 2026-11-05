/** Sending a run's pulse instant alerts and logging who got each (AIO-290). */
import type {
  InstantPulseAlertsInput,
  PulseInstantAlertCandidate,
} from "../pulse-instant-alerts.ts";
import type { DbClient } from "../supabase-clients.ts";
import type { PlannedInstantAlert } from "./planned-alert.ts";
import { buildPulseRunMessage } from "./run-message.ts";

/**
 * Queues one run message per recipient phone, listing every alert planned
 * for it, and records each phone reached in the alert's `sentTo`. Then each
 * alert is logged once per text it went out in, for the phones whose message
 * was queued. A phone whose message is not queued is left out of the rows,
 * so it gets the alert in the next run's message (dedupe is per phone,
 * phonesStillDue). Another org's dedupe drops the phones it reads there too
 * (cross-tenant-recipients.ts).
 */
export async function sendRunMessages(
  input: Pick<
    InstantPulseAlertsInput,
    "supabase" | "tenantId" | "orgName" | "queueWhatsApp"
  >,
  planned: PlannedInstantAlert[],
  now: Date,
): Promise<{ messages: number }> {
  let messages = 0;
  // Per alert: each message text it went out in → the phones that got it.
  const delivered = new Map<PlannedInstantAlert, Map<string, string[]>>();
  for (const [phone, items] of alertsByPhone(planned)) {
    const message = buildPulseRunMessage(
      input.orgName,
      now,
      items.map((item) => item.candidate),
    );
    if (!(await input.queueWhatsApp(message, phone))) {
      console.error(
        "[pulse-instant-alerts] run message not queued; its alerts are not logged for this phone",
        { tenant_id: input.tenantId, alerts: items.length },
      );
      continue;
    }

    messages += 1;
    for (const item of items) {
      item.sentTo.push(phone);
      const phonesByText = delivered.get(item) ?? new Map<string, string[]>();
      phonesByText.set(message, [...(phonesByText.get(message) ?? []), phone]);
      delivered.set(item, phonesByText);
    }
  }

  for (const [item, phonesByText] of delivered) {
    for (const [message, phones] of phonesByText) {
      await logInstantAlert(input, item.candidate, message, phones);
    }
  }

  return { messages };
}

/** Each recipient phone with the planned alerts for it, in plan order. */
function alertsByPhone(
  planned: PlannedInstantAlert[],
): Map<string, PlannedInstantAlert[]> {
  const byPhone = new Map<string, PlannedInstantAlert[]>();
  for (const item of planned) {
    for (const phone of item.recipients) {
      byPhone.set(phone, [...(byPhone.get(phone) ?? []), item]);
    }
  }

  return byPhone;
}

/**
 * The pulse_instant_alert_log row dedupe reads, for `phones`, which received
 * `message` (the run message that listed the alert). A failed insert is
 * logged, and the next run then resends.
 */
async function logInstantAlert(
  input: { supabase: Pick<DbClient, "from">; tenantId: string },
  candidate: PulseInstantAlertCandidate,
  message: string,
  phones: string[],
): Promise<void> {
  const { error } = await input.supabase
    .from("pulse_instant_alert_log")
    .insert({
      tenant_id: input.tenantId,
      client_id: candidate.client_id,
      rule_type: candidate.rule_type,
      message,
      recipient_phone: joinRecipientPhones(phones),
      campaign_key: candidate.campaign_key || null,
      fingerprint: candidate.fingerprint || null,
      severity_score: candidate.severity_score || null,
      evidence: { ...candidate.evidence, delivery: "digest" },
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
