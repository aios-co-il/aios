import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import type { DbClient } from "../supabase-clients.ts";

/**
 * Inserts the pulse_instant_alert_log row that dedupe reads, for the phones
 * the alert reached; cross-org dedupe trusts those phones. A failed insert
 * is reported, since the next run cannot see the alert and may send it again.
 */
export async function logInstantAlert(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  candidate: PulseInstantAlertCandidate,
  phones: string[],
): Promise<void> {
  const { error } = await supabase.from("pulse_instant_alert_log").insert({
    tenant_id: tenantId,
    client_id: candidate.client_id,
    rule_type: candidate.rule_type,
    message: candidate.message,
    recipient_phone: phones.join(","),
    campaign_key: candidate.campaign_key || null,
    fingerprint: candidate.fingerprint || null,
    severity_score: candidate.severity_score || null,
    evidence: candidate.evidence || {},
  });
  if (error) {
    console.error(
      "[pulse-instant-alerts] alert log insert failed; next run may resend",
      {
        client_id: candidate.client_id,
        rule_type: candidate.rule_type,
        campaign_key: candidate.campaign_key,
        error: error.message,
      },
    );
  }
}
