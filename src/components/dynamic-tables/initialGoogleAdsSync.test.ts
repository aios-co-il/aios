import { FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  runInitialGoogleAdsSync,
  type SyncInvokeResult,
} from "./initialGoogleAdsSync";

/** Runs the sync against a fake invoke result and returns the toasts shown. */
async function outcome(result: SyncInvokeResult) {
  const notify = { success: vi.fn(), error: vi.fn() };
  vi.spyOn(console, "error").mockImplementation(() => {});
  await runInitialGoogleAdsSync(() => Promise.resolve(result), notify);
  return notify;
}

describe("runInitialGoogleAdsSync", () => {
  it("shows the function's reason, not success, when invoke resolves an error", async () => {
    const response = new Response(
      JSON.stringify({
        error: "manager_account_selected",
        message: "החשבון שנבחר הוא חשבון ניהול",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
    const notify = await outcome({
      data: null,
      error: new FunctionsHttpError(response),
    });
    expect(notify.success).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith(
      "הטבלה נוצרה אך הסנכרון נכשל: החשבון שנבחר הוא חשבון ניהול",
      { duration: 12000 },
    );
  });

  it("treats a 2xx body with an error as a failed sync", async () => {
    const notify = await outcome({
      data: { error: "Google Ads API error" },
      error: null,
    });
    expect(notify.success).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith(
      "הטבלה נוצרה אך הסנכרון נכשל: Google Ads API error",
      { duration: 12000 },
    );
  });

  it("shows success when the sync succeeds", async () => {
    const notify = await outcome({ data: { success: true }, error: null });
    expect(notify.success).toHaveBeenCalledWith("הנתונים סונכרנו בהצלחה");
    expect(notify.error).not.toHaveBeenCalled();
  });
});
