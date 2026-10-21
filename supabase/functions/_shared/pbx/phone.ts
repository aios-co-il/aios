// Phone normalization and matching for Israeli numbers.

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

/** Last 9 digits, used to match phones stored in any format. */
export function phoneMatchKey(phone: unknown): string | null {
  const n = normalizePhone(phone);
  if (!n || n.length < 7) return null;
  return n.slice(-9);
}

/**
 * ILIKE pattern matching the key's digits in order, with any separators.
 * Leading zeros are dropped so "+972-3-…" still matches a "03…" key; callers
 * confirm candidates with phoneMatchKey.
 */
export function phoneLikePattern(key: string): string {
  const digits = key.replace(/\D/g, "").replace(/^0+/, "");
  return "%" + digits.split("").join("%");
}
