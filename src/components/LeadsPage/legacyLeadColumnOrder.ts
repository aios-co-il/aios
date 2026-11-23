/**
 * The CRM column order this browser kept in localStorage before the order moved
 * to the user's account. useLeadTableColumnOrder reads it once and removes it
 * after the account holds an order.
 */
export const LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY = "leads-table-column-order";

/** Reads a stored column-id order; anything malformed reads as no saved order. */
export function parseColumnOrder(
  raw: string | null | undefined,
): Array<string> {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** The order this browser saved before; none when storage is blocked. */
export function readLegacyColumnOrder(): Array<string> {
  try {
    return parseColumnOrder(
      window.localStorage.getItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY),
    );
  } catch {
    return [];
  }
}

/** Removes the browser copy once the account holds the order. */
export function clearLegacyColumnOrder(): void {
  try {
    window.localStorage.removeItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear the old browser column order", error);
  }
}
