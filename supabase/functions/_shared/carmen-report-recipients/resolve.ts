/**
 * Whom an organization's Carmen reports to (AIO-260).
 *
 * The configured list (carmen_report_recipients) wins; an empty list means the
 * organization's owners. Only staff of the organization and the extra phones
 * an owner typed in are ever returned, never a client (the DB trigger
 * carmen_report_recipients_guard rejects client phones), and each normalised
 * phone appears once. The browser imports this module too, so the settings
 * screen shows exactly what the server will do.
 */

import { normalizeNotifyPhone } from "../carmen-notify-target.ts";

/** The configured list in order, or the owners when it is empty; deduped by phone. */
export function resolveCarmenReportRecipients(input: {
  configured: ConfiguredReportRecipient[];
  staff: ReportStaffMember[];
}): CarmenReportRecipients {
  const staffById = new Map(
    input.staff.map((member) => [member.user_id, member]),
  );
  const candidates = input.configured.length
    ? input.configured.map((row) => configuredCandidate(row, staffById))
    : input.staff.filter((member) => member.is_owner).map(ownerCandidate);
  return dedupeByPhone(candidates);
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
  "member_without_phone" | "not_staff" | "invalid_phone" | "duplicate_phone";

export type SkippedReportRecipient = {
  user_id?: string;
  name: string;
  reason: ReportRecipientSkipReason;
};

export type CarmenReportRecipients = {
  recipients: CarmenReportRecipient[];
  skipped: SkippedReportRecipient[];
};

const MEMBER_NAME = "חבר צוות";
const OWNER_NAME = "בעלים";
const EXTRA_PHONE_NAME = "מספר נוסף";

type Candidate = {
  user_id?: string;
  name: string;
  rawPhone: string | null;
  source: CarmenReportRecipientSource;
  /** Why the candidate is skipped when it has no phone at all. */
  noPhoneReason: ReportRecipientSkipReason;
};

/** A configured row as a candidate: an extra phone, or a member with their staff phone. */
function configuredCandidate(
  row: ConfiguredReportRecipient,
  staffById: Map<string, ReportStaffMember>,
): Candidate {
  if (!row.user_id) {
    return {
      name: row.label?.trim() || EXTRA_PHONE_NAME,
      rawPhone: row.phone,
      source: "configured",
      noPhoneReason: "invalid_phone",
    };
  }
  const member = staffById.get(row.user_id);
  if (!member) {
    return {
      user_id: row.user_id,
      name: MEMBER_NAME,
      rawPhone: null,
      source: "configured",
      noPhoneReason: "not_staff",
    };
  }
  return {
    user_id: member.user_id,
    name: member.full_name?.trim() || MEMBER_NAME,
    rawPhone: member.phone,
    source: "configured",
    noPhoneReason: "member_without_phone",
  };
}

/** An owner as a candidate for the empty-list fallback. */
function ownerCandidate(member: ReportStaffMember): Candidate {
  return {
    user_id: member.user_id,
    name: member.full_name?.trim() || OWNER_NAME,
    rawPhone: member.phone,
    source: "owner_fallback",
    noPhoneReason: "member_without_phone",
  };
}

/** Keeps the first candidate per normalised phone; the rest are skipped with a reason. */
function dedupeByPhone(candidates: Candidate[]): CarmenReportRecipients {
  const recipients: CarmenReportRecipient[] = [];
  const skipped: SkippedReportRecipient[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const identity = candidate.user_id
      ? { user_id: candidate.user_id, name: candidate.name }
      : { name: candidate.name };
    const phone = dialablePhone(candidate.rawPhone);
    if (!phone) {
      const reason = candidate.rawPhone?.trim()
        ? "invalid_phone"
        : candidate.noPhoneReason;
      skipped.push({ ...identity, reason });
      continue;
    }
    if (seen.has(phone)) {
      skipped.push({ ...identity, reason: "duplicate_phone" });
      continue;
    }
    seen.add(phone);
    recipients.push({ ...identity, phone, source: candidate.source });
  }
  return { recipients, skipped };
}

/** Normalised digits, or null when the stored phone cannot be a WhatsApp number. */
function dialablePhone(raw: string | null): string | null {
  const phone = normalizeNotifyPhone(raw);
  return phone && phone.length >= 9 && phone.length <= 15 ? phone : null;
}
