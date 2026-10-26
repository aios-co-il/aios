import { describe, expect, it } from "vitest";
import { errorMessageOf } from "./errorMessage-b13";

describe("errorMessageOf", () => {
  it("reads the message of Error instances and error-like objects", () => {
    expect(errorMessageOf(new Error("boom"))).toBe("boom");
    expect(errorMessageOf({ message: "pg failed", code: "42P01" })).toBe(
      "pg failed",
    );
  });

  it("returns undefined when there is no string message", () => {
    expect(errorMessageOf(null)).toBeUndefined();
    expect(errorMessageOf("text")).toBeUndefined();
    expect(errorMessageOf({ message: 42 })).toBeUndefined();
    expect(errorMessageOf({})).toBeUndefined();
  });
});
