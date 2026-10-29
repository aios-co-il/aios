/**
 * Google Ads customer ids as the API takes them (AIO-342). People type them
 * as shown in Google Ads ("804-455-7496"), and the API answers
 * INVALID_CUSTOMER_ID unless the dashes are gone, so every read and save goes
 * through here. Matches the SQL normalize_google_customer_id for valid ids.
 */

/** The id without dashes or spaces; null when nothing is left. */
export function normalizeGoogleAdsCustomerId(raw: unknown): string | null {
  const text =
    typeof raw === "string" ? raw : typeof raw === "number" ? `${raw}` : "";
  const id = text.replace(/[\s-]/g, "");
  return id === "" ? null : id;
}

/**
 * The account a Google Ads report table reads, and the login-customer-id to
 * send: the table's manager (MCC) when it has one, else the account itself.
 */
export function googleAdsTableAccount(settings: {
  customer_id?: unknown;
  manager_id?: unknown;
}): { customerId: string | null; loginCustomerId: string | null } {
  const customerId = normalizeGoogleAdsCustomerId(settings.customer_id);
  return {
    customerId,
    loginCustomerId:
      normalizeGoogleAdsCustomerId(settings.manager_id) ?? customerId,
  };
}
