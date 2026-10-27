/**
 * The steps of resolveCarmenReportRecipients: each configured row or owner
 * becomes a candidate, and the first candidate per dialable phone becomes a
 * recipient; the rest are skipped with a reason.
 */

import { normalizeNotifyPhone } from "../carmen-notify-target.ts";
import type {
  CarmenReportRecipient,
  CarmenReportRecipients,
  CarmenReportRecipientSource,
  ConfiguredReportRecipient,
  ReportRecipientSkipReason,
  ReportStaffMember,
  SkippedReportRecipient,
} from "./resolve.ts";

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
  /** Set when the candidate is skipped whatever its phone. */
  refused?: ReportRecipientSkipReason;
};

/** A configured row as a candidate: an extra phone, or a member with their staff phone. */
export function configuredCandidate(
  row: ConfiguredReportRecipient,
  staffById: Map<string, ReportStaffMember>,
  clientPhones: Set<string>,
): Candidate {
  if (!row.user_id) {
    const isClient = row.phone !== null && clientPhones.has(row.phone);
    return {
      name: row.label?.trim() || EXTRA_PHONE_NAME,
      rawPhone: row.phone,
      source: "configured",
      noPhoneReason: "invalid_phone",
      refused: isClient ? "client_phone" : undefined,
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

/** An owner as a candidate for the owner fallback (empty or unreachable list). */
export function ownerCandidate(member: ReportStaffMember): Candidate {
  return {
    user_id: member.user_id,
    name: member.full_name?.trim() || OWNER_NAME,
    rawPhone: member.phone,
    source: "owner_fallback",
    noPhoneReason: "member_without_phone",
  };
}

/** Keeps the first candidate per normalised phone; the rest are skipped with a reason. */
export function dedupeByPhone(
  candidates: Candidate[],
): Omit<CarmenReportRecipients, "listUnreachable"> {
  const recipients: CarmenReportRecipient[] = [];
  const skipped: SkippedReportRecipient[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const phone = dialablePhone(candidate.rawPhone);
    if (candidate.refused) {
      skipped.push(skippedEntry(candidate, candidate.refused));
      continue;
    }
    if (!phone) {
      const reason = candidate.rawPhone?.trim()
        ? "invalid_phone"
        : candidate.noPhoneReason;
      skipped.push(skippedEntry(candidate, reason));
      continue;
    }
    if (seen.has(phone)) {
      skipped.push(skippedEntry(candidate, "duplicate_phone"));
      continue;
    }
    seen.add(phone);
    recipients.push({
      ...(candidate.user_id ? { user_id: candidate.user_id } : {}),
      name: candidate.name,
      phone,
      source: candidate.source,
    });
  }
  return { recipients, skipped };
}

/** A skipped member keeps its user_id; a skipped extra phone keeps its stored phone. */
function skippedEntry(
  candidate: Candidate,
  reason: ReportRecipientSkipReason,
): SkippedReportRecipient {
  return candidate.user_id
    ? { user_id: candidate.user_id, name: candidate.name, reason }
    : { name: candidate.name, extra_phone: candidate.rawPhone, reason };
}

/** Normalised digits, or null when the stored phone cannot be a WhatsApp number. */
function dialablePhone(raw: string | null): string | null {
  const phone = normalizeNotifyPhone(raw);
  return phone && phone.length >= 9 && phone.length <= 15 ? phone : null;
}
