/**
 * The report recipient a single-recipient notify (claude-notify, manus-notify)
 * goes to: the first configured one. The owner fallback does not apply here;
 * without a reachable configured recipient the notify keeps its staff session
 * chain.
 */

import type { CarmenReportRecipient } from "./resolve.ts";

/** The first recipient from the configured list, or undefined. */
export function notifyReportRecipient<
  T extends Pick<CarmenReportRecipient, "source">,
>(recipients: T[] | undefined): T | undefined {
  return recipients?.find((recipient) => recipient.source === "configured");
}
