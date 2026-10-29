import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionInvoke";

/** What `supabase.functions.invoke` resolves to. */
export type SyncInvokeResult = { data: unknown; error: unknown };

/** The toasts the dialog shows for the sync's outcome. */
export type SyncNotify = {
  success: (message: string) => void;
  error: (message: string, options: { duration: number }) => void;
};

/**
 * Runs a new Google Ads table's first sync and shows its outcome. A failed
 * sync resolves with `{ error }` (non-2xx) or with `data.error` instead of
 * throwing, so both count as failures; the toast carries the function's reason.
 */
export async function runInitialGoogleAdsSync(
  invoke: () => Promise<SyncInvokeResult>,
  notify: SyncNotify,
): Promise<void> {
  try {
    const { data, error } = await invoke();
    if (error) {
      throw error;
    }
    const bodyError = syncBodyError(data);
    if (bodyError) {
      throw new Error(bodyError);
    }
    notify.success("הנתונים סונכרנו בהצלחה");
  } catch (err) {
    console.error("Initial sync failed:", err);
    const reason = await edgeFunctionErrorMessage(err, "נסה לסנכרן ידנית");
    notify.error("הטבלה נוצרה אך הסנכרון נכשל: " + reason, {
      duration: 12000,
    });
  }
}

/** The failure a 2xx sync body reports, preferring its readable `message`. */
function syncBodyError(data: unknown): string | null {
  if (!data || typeof data !== "object" || !Reflect.get(data, "error")) {
    return null;
  }
  const message = Reflect.get(data, "message");
  const error = Reflect.get(data, "error");
  if (typeof message === "string" && message) {
    return message;
  }
  return typeof error === "string" ? error : "שגיאה לא מזוהה בסנכרון";
}
