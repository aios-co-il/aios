/**
 * Meta and Google Ads id spellings. The scope checks match them against the
 * ids stored in clients and crm_tables, and carmen-google-tools interpolates
 * a campaign id into GAQL, so anything that is not digits is refused.
 */

/** Digits only, after trimming. */
export function isNumericId(id: unknown): boolean {
  return /^\d+$/.test(String(id ?? "").trim());
}

/** "123" / "act_123" → both spellings, as stored in clients and crm_tables. */
export function metaAccountVariants(id: unknown): string[] | null {
  const digits = String(id ?? "")
    .trim()
    .replace(/^act_/, "");
  return /^\d+$/.test(digits) ? [digits, `act_${digits}`] : null;
}

/** "1234567890" / "123-456-7890" → both spellings. */
export function googleCustomerVariants(id: unknown): string[] | null {
  const digits = String(id ?? "")
    .trim()
    .replace(/-/g, "");
  if (!/^\d+$/.test(digits)) {
    return null;
  }
  if (digits.length !== 10) {
    return [digits];
  }
  const dashed = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return [digits, dashed];
}
