/**
 * Whom an organization's Carmen reports to (AIO-260).
 *
 * The configured list (carmen_report_recipients) wins; an empty list means the
 * organization's owners, and so does a list none of whose entries reaches a
 * phone (listUnreachable). Only staff of the organization and the extra
 * phones an owner typed in are ever returned, never a client: the DB trigger
 * carmen_report_recipients_guard refuses a client phone on write, and
 * clientPhones skips one that became a client's later. Each normalised phone
 * appears once. The browser imports this module too, so the settings screen
 * shows what the server will do.
 */

import {
  configuredCandidate,
  dedupeByPhone,
  ownerCandidate,
} from "./candidates.ts";

/**
 * The configured list in order, deduped by phone; the owners when the list is
 * empty or none of its entries is reachable.
 */
export function resolveCarmenReportRecipients(input: {
  configured: ConfiguredReportRecipient[];
  staff: ReportStaffMember[];
  /** Listed extra phones that now belong to a client (carmen_report_client_phones). */
  clientPhones?: string[];
}): CarmenReportRecipients {
  const owners = () =>
    dedupeByPhone(
      input.staff.filter((member) => member.is_owner).map(ownerCandidate),
    );
  if (!input.configured.length) {
    return { ...owners(), listUnreachable: false };
  }
  const staffById = new Map(
    input.staff.map((member) => [member.user_id, member]),
  );
  const clientPhones = new Set(input.clientPhones);
  const configured = dedupeByPhone(
    input.configured.map((row) =>
      configuredCandidate(row, staffById, clientPhones),
    ),
  );
  if (configured.recipients.length) {
    return { ...configured, listUnreachable: false };
  }
  // A list nobody on it can receive must not silence Carmen: the owners stand
  // in, as for an empty list, and the skipped entries say what to fix.
  const fallback = owners();
  return {
    recipients: fallback.recipients,
    skipped: [...configured.skipped, ...fallback.skipped],
    listUnreachable: true,
  };
}

/** A carmen_report_recipients row: a staff member or an extra phone. */
export type ConfiguredReportRecipient = {
  user_id: string | null;
  phone: string | null;
  label: string | null;
};

/** One row of the carmen_report_staff RPC. */
export type ReportStaffMember = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  is_owner: boolean;
};

export type CarmenReportRecipientSource = "configured" | "owner_fallback";

export type CarmenReportRecipient = {
  user_id?: string;
  name: string;
  /** Normalised digits (9725…), the chat id claude_notify_david expects. */
  phone: string;
  source: CarmenReportRecipientSource;
};

export type ReportRecipientSkipReason =
  | "member_without_phone"
  | "not_staff"
  | "invalid_phone"
  | "duplicate_phone"
  | "client_phone";

export type SkippedReportRecipient = {
  user_id?: string;
  /** The stored phone of a skipped extra-phone row (unique in the list). */
  extra_phone?: string | null;
  name: string;
  reason: ReportRecipientSkipReason;
};

export type CarmenReportRecipients = {
  recipients: CarmenReportRecipient[];
  skipped: SkippedReportRecipient[];
  /** The organization lists recipients, but none is reachable, so the owners stand in. */
  listUnreachable: boolean;
};
