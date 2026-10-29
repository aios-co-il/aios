import { describe, expect, it } from "vitest";
import { asJsonObject, readErrorMessage } from "./response";

describe("asJsonObject", () => {
  it("returns plain objects with all their keys", () => {
    const value = { final_output: "done", nested: { a: [1] }, empty: null };
    expect(asJsonObject(value)).toEqual(value);
  });

  it("returns null for arrays, primitives, null and undefined", () => {
    expect(asJsonObject([1, 2])).toBeNull();
    expect(asJsonObject("text")).toBeNull();
    expect(asJsonObject(3)).toBeNull();
    expect(asJsonObject(true)).toBeNull();
    expect(asJsonObject(null)).toBeNull();
    expect(asJsonObject(undefined)).toBeNull();
  });
});

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
    expect(readErrorMessage([])).toBeUndefined();
  });
});
