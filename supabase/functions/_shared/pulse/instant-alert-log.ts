import type { DbClient } from "../supabase-clients.ts";
import type { PlannedInstantAlert } from "./planned-alert.ts";

/** Inserts the pulse_instant_alert_log row that dedupe reads. */
export async function logInstantAlert(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  item: PlannedInstantAlert,
): Promise<void> {
  const { candidate } = item;
  await supabase.from("pulse_instant_alert_log").insert({
    tenant_id: tenantId,
    client_id: candidate.client_id,
    rule_type: candidate.rule_type,
    message: candidate.message,
    recipient_phone: item.recipients.join(","),
    campaign_key: candidate.campaign_key || null,
    fingerprint: candidate.fingerprint || null,
    severity_score: candidate.severity_score || null,
    evidence: candidate.evidence || {},
  });
}
