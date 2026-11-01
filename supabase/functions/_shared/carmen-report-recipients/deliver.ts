/**
 * Sends one Carmen report to everyone the organization's Carmen reports to.
 * Each recipient gets a log entry, so a report that reached nobody shows up in
 * heartbeat_logs instead of passing silently.
 */

import type {
  CarmenReportRecipient,
  CarmenReportRecipientSource,
} from "./resolve.ts";

/** Queues the message to each recipient in list order and reports each outcome. */
export async function queueToReportRecipients(
  recipients: CarmenReportRecipient[],
  message: string,
  queue: (message: string, phone: string) => Promise<boolean>,
): Promise<ReportDelivery[]> {
  const deliveries: ReportDelivery[] = [];
  for (const recipient of recipients) {
    deliveries.push({
      recipient: recipient.name,
      phone: recipient.phone,
      source: recipient.source,
      queued: await queue(message, recipient.phone),
    });
  }
  return deliveries;
}

export type ReportDelivery = {
  recipient: string;
  phone: string;
  source: CarmenReportRecipientSource;
  queued: boolean;
};
