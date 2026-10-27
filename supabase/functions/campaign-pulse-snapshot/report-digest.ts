/**
 * The organization-wide part of the Sunday pulse: the full digest and the
 * missing-campaigner-phone alert go to everyone the organization's Carmen
 * reports to (carmen_report_recipients, else its owners).
 */

import {
  queueToReportRecipients,
  type ReportDelivery,
} from "../_shared/carmen-report-recipients/deliver.ts";
import type { CarmenReportRecipient } from "../_shared/carmen-report-recipients/resolve.ts";
import {
  buildPulseMissingPhoneAlert,
  type PulseCampaignerMissingPhone,
} from "../_shared/pulse-delivery.ts";

/** Full-tenant digest to each report recipient; sent when any was queued. */
export async function deliverReportDigest(input: {
  recipients: CarmenReportRecipient[];
  digest: string;
  queue: Queue;
}): Promise<{ sent: boolean; entries: ReportDigestEntry[] }> {
  const deliveries = await queueToReportRecipients(
    input.recipients,
    input.digest,
    input.queue,
  );
  return {
    sent: deliveries.some((row) => row.queued),
    entries: deliveries.map((row) => ({ type: "report_digest", ...row })),
  };
}

/** Asks the report recipients to add the phones of campaigners who have none. */
export async function deliverMissingPhoneAlert(input: {
  recipients: CarmenReportRecipient[];
  campaigners: PulseCampaignerMissingPhone[];
  tenantLabel: string;
  queue: Queue;
}): Promise<{ sent: boolean; entry: MissingPhoneAlertEntry } | null> {
  if (!input.campaigners.length || !input.recipients.length) {
    return null;
  }
  const message = buildPulseMissingPhoneAlert(input.campaigners, {
    tenantLabel: input.tenantLabel,
  });
  const recipients = await queueToReportRecipients(
    input.recipients,
    message,
    input.queue,
  );
  return {
    sent: recipients.some((row) => row.queued),
    entry: {
      type: "missing_phone_alert",
      campaigners: input.campaigners.map((row) => row.name),
      recipients,
    },
  };
}

type Queue = (message: string, phone: string) => Promise<boolean>;

export type ReportDigestEntry = ReportDelivery & { type: "report_digest" };

export type MissingPhoneAlertEntry = {
  type: "missing_phone_alert";
  campaigners: string[];
  recipients: ReportDelivery[];
};
