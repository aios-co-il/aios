/**
 * Inbound lead dedup rule: a lead is a returning lead only when the phone and
 * the email both match. Any difference, including an email present on only one
 * side, means a new lead; a shared email alone (often a placeholder like
 * "aaaaa@gmail.com") never merges two people.
 */

export const RETURNING_LEAD_TAG = "ליד חוזר";

export function normalizeLeadPhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[\s\-().+]/g, "").replace(/^0/, "972");
  return digits || null;
}

export function normalizeLeadEmail(
  email: string | null | undefined,
): string | null {
  const value = email?.trim().toLowerCase();
  return value || null;
}

type CandidateLead = { phone?: string | null; email?: string | null };

/** Same phone and same email (both empty counts as the same). */
export function isSameInboundLead(
  existing: CandidateLead,
  incoming: CandidateLead,
): boolean {
  const incomingPhone = normalizeLeadPhone(incoming.phone);
  if (!incomingPhone) return false;
  if (normalizeLeadPhone(existing.phone) !== incomingPhone) return false;

  return (
    normalizeLeadEmail(existing.email) === normalizeLeadEmail(incoming.email)
  );
}

export function pickDuplicateLead<T extends CandidateLead>(
  candidates: T[] | null | undefined,
  incoming: CandidateLead,
): T | null {
  return candidates?.find((lead) => isSameInboundLead(lead, incoming)) ?? null;
}

/** Phone spellings to look up with an `in` filter before the broader scan. */
export function leadPhoneVariants(phone: string | null | undefined): string[] {
  const normalized = normalizeLeadPhone(phone);
  if (!normalized) return [];
  const local = normalized.replace(/^972/, "");
  return [
    ...new Set(
      [
        phone?.trim(),
        normalized,
        `0${local}`,
        `+${normalized}`,
        `+972${local}`,
      ].filter((v): v is string => Boolean(v)),
    ),
  ];
}
