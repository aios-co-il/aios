/**
 * Cross-org dedupe of pulse instant alerts, per person (AIO-226). A client of
 * an agency shared between orgs (DMM and MarketingCaptain) is in both orgs'
 * pulse, so each org alerts on it. A person on both orgs' recipient lists
 * gets the finding once; each org's other recipients still get theirs. The
 * phone is the person key because the alert log stores recipients by phone.
 */
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import type { DbClient } from "../supabase-clients.ts";
import {
  decideInstantAlertDelivery,
  recentAlertDeliveries,
} from "./instant-alert-dedupe.ts";
import { splitRecipientPhones } from "./instant-alert-send.ts";

/**
 * `recipients` minus the phones an org sharing the client's agency with this
 * org already sent this finding to inside the rule's throttle window. A
 * failed lookup alerts everyone: a duplicate beats a missed alert, and this
 * org's own dedupe has already run.
 */
export async function withoutPhonesAlertedElsewhere<
  Recipient extends { phone: string },
>(
  input: { supabase: Pick<DbClient, "from">; tenantId: string },
  candidate: PulseInstantAlertCandidate,
  agencyId: string | null | undefined,
  recipients: Recipient[],
  throttleHours: number,
  now: Date,
): Promise<Recipient[]> {
  if (!recipients.length) {
    return recipients;
  }
  const peerTenantIds = await tenantsSharingAgency(input, agencyId);
  if (!peerTenantIds.length) {
    return recipients;
  }
  const { data, error } = await recentAlertDeliveries(
    input.supabase,
    peerTenantIds,
    candidate,
    throttleHours,
    now,
  );
  if (error) {
    console.error(
      "[pulse-instant-alerts] cross-org dedupe lookup failed",
      error.message,
    );
    return recipients;
  }
  const alerted = new Set<string>();
  for (const row of data) {
    if (decideInstantAlertDelivery(candidate, [row]).send) {
      continue;
    }
    for (const phone of splitRecipientPhones(row.recipient_phone)) {
      alerted.add(phone);
    }
  }
  return recipients.filter((recipient) => !alerted.has(recipient.phone));
}

/**
 * The other orgs on this org's own grants of the agency (agency_tenant_access,
 * this org on either side), so the cross-org log read stays inside orgs this
 * org shares the client with (TENANT_ISOLATION.md). An unshared agency has
 * none, and then no log read runs. Two orgs that each hold a grant from a
 * third org are not peers of each other, so they do not dedupe each other.
 */
async function tenantsSharingAgency(
  input: { supabase: Pick<DbClient, "from">; tenantId: string },
  agencyId: string | null | undefined,
): Promise<string[]> {
  if (!agencyId) {
    return [];
  }
  const { data, error } = await input.supabase
    .from("agency_tenant_access")
    .select("source_tenant_id, accessing_tenant_id")
    .eq("agency_id", agencyId)
    .or(
      `source_tenant_id.eq.${input.tenantId},accessing_tenant_id.eq.${input.tenantId}`,
    );
  if (error) {
    console.error(
      "[pulse-instant-alerts] shared-agency lookup failed",
      error.message,
    );
    return [];
  }
  const peers = new Set(
    data.flatMap((grant) => [
      grant.source_tenant_id,
      grant.accessing_tenant_id,
    ]),
  );
  peers.delete(input.tenantId);
  return Array.from(peers);
}
