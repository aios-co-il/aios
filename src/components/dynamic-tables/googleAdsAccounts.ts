/** One account from `google-ads-auth` `get_accounts`. */
export interface GoogleAdsAccount {
  id: string;
  name: string;
  currency: string;
  manager: boolean;
  /** The MCC the account is reached through, sent as `login-customer-id`. */
  manager_id?: string;
  // Which connection (tenant_integrations row) this account is reached through.
  integration_id?: string;
  integration_user_id?: string;
  integration_email?: string | null;
}

// Google returns no metrics for a manager (MCC) account, so a report on one
// always fails to sync; the pickers disable them and explain why.
export const MANAGER_ACCOUNT_OPTION_NOTE =
  " • חשבון ניהול (MCC) — אין בו נתוני קמפיינים";

export const MANAGER_ACCOUNT_HINT =
  "חשבונות ניהול (MCC) אינם ניתנים לבחירה — Google לא מחזירה נתוני קמפיינים עבורם. יש לבחור את חשבון הפרסום עצמו.";

export const MANAGER_ACCOUNT_REFUSAL =
  "החשבון שנבחר הוא חשבון ניהול (MCC). Google לא מחזירה נתוני קמפיינים עבורו — יש לבחור את חשבון הפרסום עצמו.";

/**
 * The `manager_id` setting for a newly chosen account, so the sync logs in
 * through that account's MCC. Saving the account the table already has leaves
 * the setting as it was, so a `manager_id` the sync discovered is kept. A listed
 * account without one is reached directly, so the previous account's MCC is
 * cleared; an id typed by hand that is not in the list leaves the setting as it
 * was.
 */
export function managerIdSetting(
  account: GoogleAdsAccount | undefined,
  savedCustomerId: string | null | undefined,
): {
  manager_id?: string | null;
} {
  const unchanged =
    !!account && account.id === (savedCustomerId ?? "").replace(/\D/g, "");
  if (!account || unchanged) {
    return {};
  }
  return { manager_id: account.manager_id ?? null };
}
