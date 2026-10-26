import { describe, expect, it } from "vitest";
import { errorMessage, isJsonObject } from "./typing-b26";

describe("errorMessage", () => {
  it("reads the message of Error instances", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("reads the message of error-like objects such as PostgREST errors", () => {
    expect(errorMessage({ message: "duplicate key", code: "23505" })).toBe(
      "duplicate key",
    );
  });

  it("returns undefined when there is no string message", () => {
    expect(errorMessage("boom")).toBeUndefined();
    expect(errorMessage(null)).toBeUndefined();
    expect(errorMessage(undefined)).toBeUndefined();
    expect(errorMessage({ message: 42 })).toBeUndefined();
  });
});

describe("isJsonObject", () => {
  it("accepts plain objects only", () => {
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject("x")).toBe(false);
  });
});
