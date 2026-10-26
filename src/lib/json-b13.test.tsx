import { describe, expect, it } from "vitest";
import { isJson, toJson } from "./json-b13";

describe("isJson", () => {
  it("accepts JSON primitives, arrays and plain objects", () => {
    expect(isJson(null)).toBe(true);
    expect(isJson({ a: 1, b: ["x", true, null], c: { d: undefined } })).toBe(
      true,
    );
  });

  it("rejects non-JSON values", () => {
    expect(isJson(undefined)).toBe(false);
    expect(isJson(new Date())).toBe(false);
    expect(isJson({ fn: () => 1 })).toBe(false);
    expect(isJson([1, Symbol("s")])).toBe(false);
  });
});

describe("toJson", () => {
  it("returns JSON values unchanged and throws otherwise", () => {
    const value = { a: [1, 2] };
    expect(toJson(value)).toBe(value);
    expect(() => toJson({ d: new Date() })).toThrow(TypeError);
  });
});
