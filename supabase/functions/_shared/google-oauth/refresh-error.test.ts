import { assertStrictEquals } from "jsr:@std/assert@1";
import { isPermanentGoogleOAuthError } from "./refresh-error.ts";

Deno.test("isPermanentGoogleOAuthError", async (t) => {
  await t.step("a revoked token or a gone client is permanent", () => {
    for (const error of [
      "invalid_grant",
      "unauthorized_client",
      "invalid_client",
    ]) {
      assertStrictEquals(isPermanentGoogleOAuthError(error), true, error);
    }
  });

  await t.step("throttling, outages and unknown answers are not", () => {
    for (const error of [
      "rate_limit_exceeded",
      "temporarily_unavailable",
      "internal_failure",
      "",
      undefined,
      null,
      500,
    ]) {
      assertStrictEquals(isPermanentGoogleOAuthError(error), false);
    }
  });
});
