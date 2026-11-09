import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { errorMessage, readErrorMessage } from "./error-message.ts";

describe("error message contracts", () => {
  it("reads Supabase plain-object errors, JavaScript Errors and non-object throws", () => {
    assertEquals(
      errorMessage({ message: "Permission denied", code: "42501" }),
      "Permission denied",
    );
    assertEquals(errorMessage(new Error("Network failed")), "Network failed");
    assertEquals(errorMessage("failure"), "failure");
    assertEquals(errorMessage(null), "null");
  });

  it("reads top-level HTTP error messages and declines malformed message fields", () => {
    assertEquals(
      readErrorMessage({ message: "Unauthorized", error: { message: {} } }),
      "Unauthorized",
    );
    assertEquals(readErrorMessage({ message: { token: "secret" } }), undefined);
    assertEquals(readErrorMessage({ message: null }), undefined);
    assertEquals(
      readErrorMessage({ error: { message: "Nested provider message" } }),
      undefined,
    );
    assertEquals(readErrorMessage([]), undefined);
    assertEquals(readErrorMessage(null), undefined);
  });
});
