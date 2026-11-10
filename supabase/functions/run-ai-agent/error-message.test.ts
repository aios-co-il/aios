import { assertEquals } from "jsr:@std/assert@1";
import { errorMessage, readErrorMessage } from "./error-message.ts";

Deno.test("error message contracts", async (t) => {
  await t.step(
    "reads Supabase plain-object errors, JavaScript Errors and non-object throws",
    () => {
      assertEquals(
        errorMessage({ message: "Permission denied", code: "42501" }),
        "Permission denied",
      );
      assertEquals(errorMessage(new Error("Network failed")), "Network failed");
      assertEquals(errorMessage("failure"), "failure");
      assertEquals(errorMessage(null), "null");
    },
  );

  await t.step(
    "reads top-level HTTP error messages and declines malformed message fields",
    () => {
      assertEquals(
        readErrorMessage({ message: "Unauthorized", error: { message: {} } }),
        "Unauthorized",
      );
      assertEquals(
        readErrorMessage({ message: { token: "secret" } }),
        undefined,
      );
      assertEquals(readErrorMessage({ message: null }), undefined);
      assertEquals(
        readErrorMessage({ error: { message: "Nested provider message" } }),
        undefined,
      );
      assertEquals(readErrorMessage([]), undefined);
      assertEquals(readErrorMessage(null), undefined);
    },
  );
});
