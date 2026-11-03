/**
 * The JSON body the sync returns for a failed Google Ads query. `message` is the
 * Hebrew or Google-worded text the client shows; `error` stays machine-readable.
 */
export function googleAdsErrorBody(error: unknown, customerId: string) {
  if (isManagerAccountError(error)) {
    const message = managerAccountMessage(customerId);
    return {
      error: "manager_account_selected",
      message,
      details: message,
      customer_id: customerId,
    };
  }
  const text = googleAdsErrorText(error);
  return { error: "Google Ads API error", message: text, details: text };
}

/** Finds the Google Ads error in any response shape: object, array or wrapped. */
export function detectGoogleAdsError(
  data: unknown,
): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = detectGoogleAdsError(entry);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isRecord(data)) {
    return null;
  }
  if (isRecord(data.error)) {
    return data.error;
  }
  return typeof data.error === "string" && data.error
    ? { message: data.error }
    : null;
}

/** Google's error code for metrics requested from a manager (MCC) account. */
const MANAGER_METRICS_CODE = "REQUESTED_METRICS_FOR_MANAGER";

/**
 * True when the report points at a manager (MCC) account. Google never returns
 * metrics for one, so retrying through other `login-customer-id`s cannot help:
 * the account on the table has to change.
 */
export function isManagerAccountError(error: unknown): boolean {
  return describeGoogleAdsError(error).code === MANAGER_METRICS_CODE;
}

/**
 * One line describing a Google Ads failure. The outer message is always the
 * placeholder "Request contains an invalid argument."; Google's actual reason
 * and code sit in `details[].errors[]`.
 */
export function googleAdsErrorText(error: unknown): string {
  const { outerMessage, detailMessage, code } = describeGoogleAdsError(error);
  const base = detailMessage || outerMessage || "שגיאה לא מזוהה מ-Google Ads";
  return code ? `${base} (${code})` : base;
}

interface GoogleAdsErrorInfo {
  outerMessage: string;
  detailMessage: string | null;
  code: string | null;
}

/** Reads the first specific message and error code out of a google.rpc.Status. */
function describeGoogleAdsError(error: unknown): GoogleAdsErrorInfo {
  const err = isRecord(error) ? error : {};
  const outerMessage = typeof err.message === "string" ? err.message : "";
  let detailMessage: string | null = null;
  let code: string | null = null;
  const details = Array.isArray(err.details) ? err.details : [];
  for (const detail of details) {
    const errors =
      isRecord(detail) && Array.isArray(detail.errors) ? detail.errors : [];
    for (const inner of errors) {
      if (!isRecord(inner)) {
        continue;
      }
      if (!detailMessage && typeof inner.message === "string") {
        detailMessage = inner.message;
      }
      if (!code && isRecord(inner.errorCode)) {
        const value = Object.values(inner.errorCode)[0];
        code = typeof value === "string" ? value : null;
      }
    }
  }
  return { outerMessage, detailMessage, code };
}

/** Hebrew, actionable text for a report pointed at a manager account. */
function managerAccountMessage(customerId: string): string {
  const formatted = customerId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  return (
    `החשבון שנבחר לדוח (${formatted}) הוא חשבון ניהול (MCC) ולא חשבון פרסום. ` +
    `Google לא מחזירה נתוני קמפיינים עבור חשבון ניהול. ` +
    `יש לפתוח את הגדרות הטבלה ולבחור את חשבון הפרסום עצמו.`
  );
}

/** Type guard: a non-null object whose fields can be read by key. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
