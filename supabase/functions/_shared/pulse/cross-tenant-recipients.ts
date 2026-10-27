/**
 * Cross-org dedupe of pulse instant alerts, per person (AIO-226). A client of
 * an agency shared between orgs (DMM and MarketingCaptain) is in both orgs'
 * pulse, so each org alerts on it. A person on both orgs' recipient lists
 * gets the finding once; each org's other recipients still get theirs. The
 * phone is the person key because the alert log stores recipients by phone.
 */
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import type { DbClient } from "../supabase-clients.ts";
import { decideInstantAlertDelivery } from "./instant-alert-dedupe.ts";

type OtherTenantLogRow = {
  tenant_id?: string | null;
  recipient_phone?: string | null;
  fingerprint?: string | null;
  severity_score?: number | string | null;
};

/**
 * `recipients` minus the phones another org already sent this finding to
 * inside the rule's throttle window.
 */
export async function withoutPhonesAlertedElsewhere<
  Recipient extends { phone: string },
>(
  input: { supabase: Pick<DbClient, "from">; tenantId: string },
  candidate: PulseInstantAlertCandidate,
  recipients: Recipient[],
  throttleHours: number,
  now: Date,
): Promise<Recipient[]> {
  const rows = await otherTenantDeliveries(
    input,
    candidate,
    throttleHours,
    now,
  );
  const alerted = new Set<string>();
  for (const row of rows) {
    if (decideInstantAlertDelivery(candidate, [row]).send) {
      continue;
    }
    for (const phone of (row.recipient_phone || "").split(",")) {
      if (phone.trim()) {
        alerted.add(phone.trim());
      }
    }
  }
  return recipients.filter((recipient) => !alerted.has(recipient.phone));
}

/**
 * Other orgs' log rows of this client + rule (+ campaign) inside the throttle
 * window, newest first. Own-org rows are left to isInstantAlertSuppressed. A
 * failed lookup returns none, so everyone is alerted: a duplicate beats a
 * missed alert, and this org's own dedupe has already run.
 */
async function otherTenantDeliveries(
  input: { supabase: Pick<DbClient, "from">; tenantId: string },
  candidate: PulseInstantAlertCandidate,
  throttleHours: number,
  now: Date,
): Promise<OtherTenantLogRow[]> {
  const since = new Date(
    now.getTime() - throttleHours * 60 * 60 * 1000,
  ).toISOString();
  let query = input.supabase
    .from("pulse_instant_alert_log")
    .select("tenant_id, recipient_phone, fingerprint, severity_score")
    .eq("client_id", candidate.client_id)
    .eq("rule_type", candidate.rule_type)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(50);
  if (candidate.campaign_key) {
    query = query.eq("campaign_key", candidate.campaign_key);
  }
  const { data, error } = await query;
  if (error) {
    console.error(
      "[pulse-instant-alerts] cross-org dedupe lookup failed",
      error.message,
    );
    return [];
  }
  return (data || []).filter((row) => row.tenant_id !== input.tenantId);
}
