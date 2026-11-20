/** Normalize Israeli / international WhatsApp digits for comparison. */
export function normalizeNotifyPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) {
    return null;
  }
  // Strip WhatsApp JID suffix (@c.us / @g.us / @lid)
  const local = String(raw).trim().split("@")[0] ?? "";
  let digits = local.replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    digits = `972${digits.slice(1)}`;
  }
  if (digits.startsWith("9720")) {
    digits = `972${digits.slice(4)}`;
  }
  return digits;
}

/** Compare normalized phones, retaining the existing suffix matching. */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeNotifyPhone(a);
  const nb = normalizeNotifyPhone(b);
  if (!na || !nb) {
    return false;
  }
  return na === nb || na.endsWith(nb) || nb.endsWith(na);
}
