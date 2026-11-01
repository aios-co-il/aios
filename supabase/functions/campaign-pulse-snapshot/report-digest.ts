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

/**
 * Full-tenant digest to each report recipient; sent when any was queued.
 * `getsDigest` holds the phones the scoped step then skips: the ones the
 * digest was queued to, or in a preview everyone the real run sends it to.
 * A run for one campaigner sends no digest and skips nobody, so that
 * campaigner gets their own.
 */
export async function deliverReportDigest(input: {
  tenantId: string;
  recipients: CarmenReportRecipient[];
  digest: string;
  queue: Queue;
  previewOnly: boolean;
  /** Set when the run is for one campaigner only. */
  campaignerName: string | null;
}): Promise<ReportDigestResult> {
  if (input.campaignerName) {
    return { sent: false, entries: [], getsDigest: new Set() };
  }
  if (input.previewOnly) {
    const phones = input.recipients.map((recipient) => recipient.phone);
    return { sent: false, entries: [], getsDigest: new Set(phones) };
  }
  const deliveries = await queueToReportRecipients(
    input.recipients,
    input.digest,
    input.queue,
  );
  const queued = deliveries.filter((row) => row.queued);
  if (!queued.length) {
    console.error(
      "[campaign-pulse] full digest reached no report recipient",
      input.tenantId,
    );
  }
  return {
    sent: queued.length > 0,
    entries: deliveries.map((row) => ({ type: "report_digest", ...row })),
    getsDigest: new Set(queued.map((row) => row.phone)),
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

export type ReportDigestResult = {
  sent: boolean;
  entries: ReportDigestEntry[];
  /** Normalised phones the scoped step skips (see deliverReportDigest). */
  getsDigest: Set<string>;
};

export type MissingPhoneAlertEntry = {
  type: "missing_phone_alert";
  campaigners: string[];
  recipients: ReportDelivery[];
};
