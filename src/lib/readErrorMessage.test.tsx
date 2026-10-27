import { describe, expect, it } from "vitest";
import { readErrorMessage } from "./readErrorMessage";

describe("readErrorMessage", () => {
  it("reads the message of Error instances and error-like objects", () => {
    expect(readErrorMessage(new Error("boom"))).toBe("boom");
    expect(readErrorMessage({ message: "PGRST116", code: "x" })).toBe(
      "PGRST116",
    );
    expect(readErrorMessage({ message: 42 })).toBe("42");
  });

  it("returns undefined when there is no message", () => {
    expect(readErrorMessage("plain")).toBeUndefined();
    expect(readErrorMessage(null)).toBeUndefined();
    expect(readErrorMessage(undefined)).toBeUndefined();
    expect(readErrorMessage({ code: "x" })).toBeUndefined();
    expect(readErrorMessage({ message: null })).toBeUndefined();
  });
});
