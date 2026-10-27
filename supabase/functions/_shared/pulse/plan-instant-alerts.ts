/** Which pulse instant alerts a run sends, decided before any is queued. */
import type {
  InstantPulseAlertsInput,
  PulseAlertRuleType,
  PulseInstantAlertCandidate,
} from "../pulse-instant-alerts.ts";
import { withoutPhonesAlertedElsewhere } from "./cross-tenant-recipients.ts";
import {
  isInstantAlertSuppressed,
  type InstantAlertLogRow,
} from "./instant-alert-dedupe.ts";
import type { PlannedInstantAlert } from "./planned-alert.ts";

const RULE_THROTTLE_HOURS: Record<PulseAlertRuleType, number> = {
  no_contact: 7 * 24,
  cpl_spike: 7 * 24,
  connection_lost: 24,
  campaign_exception: 7 * 24,
};

/**
 * Code decides what goes out, before any message is queued: dedupe and
 * throttle, then the org's recipients from `recipientsFor` minus the phones
 * another org already alerted. Alerts accepted earlier in this run count
 * like log rows, since they are logged only after the sends.
 */
export async function planInstantAlerts(
  input: Pick<InstantPulseAlertsInput, "supabase" | "tenantId">,
  candidates: PulseInstantAlertCandidate[],
  now: Date,
  recipientsFor: (
    candidate: PulseInstantAlertCandidate,
  ) => Promise<Array<{ phone: string }>>,
): Promise<{ planned: PlannedInstantAlert[]; skipped: number }> {
  const planned: PlannedInstantAlert[] = [];
  let skipped = 0;
  const acceptedThisRun = new Map<string, InstantAlertLogRow[]>();
  for (const candidate of candidates) {
    const throttleHours = RULE_THROTTLE_HOURS[candidate.rule_type];
    const runKey = [
      candidate.rule_type,
      candidate.client_id,
      candidate.campaign_key || "",
    ].join("|");
    const earlier = acceptedThisRun.get(runKey) || [];
    if (
      await isInstantAlertSuppressed(
        input,
        candidate,
        throttleHours,
        now,
        earlier,
      )
    ) {
      skipped += 1;
      continue;
    }

    const recipients = await withoutPhonesAlertedElsewhere(
      input,
      candidate,
      await recipientsFor(candidate),
      throttleHours,
      now,
    );
    if (!recipients.length) {
      skipped += 1;
      continue;
    }

    acceptedThisRun.set(runKey, [
      {
        fingerprint: candidate.fingerprint,
        severity_score: candidate.severity_score,
      },
      ...earlier,
    ]);
    const phones = recipients.map((row) => row.phone);
    planned.push({
      candidate,
      recipients: phones,
      individual: phones,
      sentTo: [],
      summarizedTo: [],
    });
  }

  return { planned, skipped };
}
