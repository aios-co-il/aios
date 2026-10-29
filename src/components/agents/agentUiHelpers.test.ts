import { describe, expect, it } from "vitest";
import {
  asJsonArray,
  asJsonObject,
  isOneOf,
  jsonPrimitive,
  jsonString,
  parseJsonArray,
  thrownMessage,
} from "./agentUiHelpers.ts";

describe("agentUiHelpers", () => {
  it("asJsonObject accepts plain objects only", () => {
    expect(asJsonObject({ a: 1 })).toEqual({ a: 1 });
    expect(asJsonObject({ a: { b: [1, null] } })).toEqual({
      a: { b: [1, null] },
    });
    expect(asJsonObject([1])).toBe(null);
    expect(asJsonObject("x")).toBe(null);
    expect(asJsonObject(null)).toBe(null);
    expect(asJsonObject(undefined)).toBe(null);
  });

  it("asJsonArray returns arrays and [] otherwise", () => {
    expect(asJsonArray([1, "a"])).toEqual([1, "a"]);
    expect(asJsonArray({ length: 2 })).toEqual([]);
    expect(asJsonArray("abc")).toEqual([]);
    expect(asJsonArray(null)).toEqual([]);
  });

  it("parseJsonArray is null for non-arrays", () => {
    expect(parseJsonArray([{ input: "q" }])).toEqual([{ input: "q" }]);
    expect(parseJsonArray({ input: "q" })).toBe(null);
    expect(parseJsonArray("[]")).toBe(null);
    expect(parseJsonArray(null)).toBe(null);
  });

  it("jsonString reads string fields only", () => {
    expect(jsonString({ repo: "a/b" }, "repo")).toBe("a/b");
    expect(jsonString({ repo: 5 }, "repo")).toBe(undefined);
    expect(jsonString(["repo"], "repo")).toBe(undefined);
    expect(jsonString(null, "repo")).toBe(undefined);
  });

  it("jsonPrimitive drops nested objects and arrays", () => {
    expect(jsonPrimitive("t")).toBe("t");
    expect(jsonPrimitive(3)).toBe(3);
    expect(jsonPrimitive(null)).toBe(null);
    expect(jsonPrimitive(false)).toBe(false);
    expect(jsonPrimitive(undefined)).toBe(undefined);
    expect(jsonPrimitive({ a: 1 })).toBe(undefined);
    expect(jsonPrimitive([1])).toBe(undefined);
  });

  it("isOneOf narrows to the listed values", () => {
    const kinds = ["edge", "mcp"] as const;
    expect(isOneOf(kinds, "edge")).toBe(true);
    expect(isOneOf(kinds, "other")).toBe(false);
  });

  it("thrownMessage reads message from error-like values", () => {
    expect(thrownMessage(new Error("boom"))).toBe("boom");
    expect(thrownMessage({ message: "pg error", code: "42" })).toBe("pg error");
    expect(thrownMessage("plain")).toBe(undefined);
    expect(thrownMessage(null)).toBe(undefined);
    expect(thrownMessage({ message: 42 })).toBe("42");
    expect(thrownMessage({ message: undefined })).toBe(undefined);
    expect(thrownMessage({ code: "x" })).toBe(undefined);
  });
});
