import { FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  detectGoogleAdsError,
  googleAdsErrorBody,
} from "../../supabase/functions/sync-google-ads-data/google-ads-errors.ts";
import { edgeFunctionErrorMessage } from "./edgeFunctionInvoke";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

/** What `supabase.functions.invoke` returns as `error` for a non-2xx answer. */
function httpError(status: number, body: unknown): FunctionsHttpError {
  return new FunctionsHttpError(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("edgeFunctionErrorMessage", () => {
  it("shows the function's message instead of the generic non-2xx text", async () => {
    const error = httpError(400, {
      error: "needs_reauth",
      message: "יש לחבר מחדש.",
    });
    expect(await edgeFunctionErrorMessage(error, "הסנכרון נכשל")).toBe(
      "יש לחבר מחדש.",
    );
  });

  it("falls back to the body's error, then details", async () => {
    expect(
      await edgeFunctionErrorMessage(
        httpError(400, { error: "needs_reauth" }),
        "x",
      ),
    ).toBe("needs_reauth");
    expect(
      await edgeFunctionErrorMessage(
        httpError(400, { details: "CUSTOMER_NOT_ENABLED" }),
        "x",
      ),
    ).toBe("CUSTOMER_NOT_ENABLED");
  });

  it("leaves the body readable for a second caller", async () => {
    const error = httpError(400, { message: "first read" });
    await edgeFunctionErrorMessage(error, "x");
    expect(await edgeFunctionErrorMessage(error, "x")).toBe("first read");
  });

  it("keeps the thrown message when the body is not JSON", async () => {
    const error = new FunctionsHttpError(
      new Response("<html>gateway timeout</html>", { status: 504 }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await edgeFunctionErrorMessage(error, "x")).toBe(
      "Edge Function returned a non-2xx status code",
    );
  });

  it("uses the fallback when there is no error message at all", async () => {
    expect(await edgeFunctionErrorMessage(null, "הסנכרון נכשל")).toBe(
      "הסנכרון נכשל",
    );
  });

  it("turns the sync's manager-account answer into instructions", async () => {
    const managerFailure = detectGoogleAdsError([
      {
        error: {
          message: "Request contains an invalid argument.",
          details: [
            {
              errors: [
                {
                  errorCode: { queryError: "REQUESTED_METRICS_FOR_MANAGER" },
                  message: "Metrics cannot be requested for a manager account.",
                },
              ],
            },
          ],
        },
      },
    ]);
    const shown = await edgeFunctionErrorMessage(
      httpError(400, googleAdsErrorBody(managerFailure, "4568787244")),
      "הסנכרון נכשל",
    );
    expect(shown).toMatch(/456-878-7244/);
    expect(shown).toMatch(/לבחור את חשבון הפרסום עצמו/);
  });
});
