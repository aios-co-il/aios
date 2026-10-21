// Phone normalization and matching for Israeli numbers, shared by telephony
// webhooks (Maskyoo and the generic PBX).

/** Digits-only local Israeli format (0XXXXXXXXX). */
export function normalizePhone(phone: unknown): string | null {
  if (phone === null || phone === undefined) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("972")) digits = "0" + digits.slice(3);
  else if (digits.length === 9 && !digits.startsWith("0"))
    digits = "0" + digits;
  return digits;
}

/**
 * Last 9 digits of the normalized number. Must match the SQL
 * public.phone_match_key, which indexes leads and clients by it.
 */
export function phoneMatchKey(phone: unknown): string | null {
  const n = normalizePhone(phone);
  if (!n || n.length < 7) return null;
  return n.slice(-9);
}
