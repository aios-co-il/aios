import { describe, expect, it } from "vitest";
import {
  asJsonObject,
  asStringMap,
  errorMessageOf,
  isJsonObject,
  jsonString,
  jsonStringArray,
  readText,
} from "./jsonFields";

describe("frontend JSON field readers", () => {
  it("accepts plain objects only", () => {
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(asJsonObject("x")).toEqual({});
  });

  it("reads string fields of JSON objects only", () => {
    expect(jsonString({ a: "x" }, "a")).toBe("x");
    expect(jsonString({ a: 1 }, "a")).toBeUndefined();
    expect(jsonString(["x"], "0")).toBeUndefined();
    expect(jsonString(null, "a")).toBeUndefined();
  });

  it("keeps only the strings of a JSON array", () => {
    expect(jsonStringArray(["a", 1, null, "b"])).toEqual(["a", "b"]);
    expect(jsonStringArray("a")).toEqual([]);
  });

  it("reads text settings and stringifies finite numbers", () => {
    expect(readText({ id: "a" }, "id")).toBe("a");
    expect(readText({ id: 42 }, "id")).toBe("42");
    expect(readText({ id: Number.NaN }, "id")).toBeUndefined();
    expect(readText(null, "id")).toBeUndefined();
  });

  it("keeps the string entries of an object", () => {
    expect(asStringMap({ a: "1", b: 2 })).toEqual({ a: "1" });
    expect(asStringMap([])).toBeNull();
  });

  it("reads error messages from error-like objects", () => {
    expect(errorMessageOf(new Error("boom"))).toBe("boom");
    expect(errorMessageOf({ message: "pg" })).toBe("pg");
    expect(errorMessageOf({ message: 3 })).toBe("3");
    expect(errorMessageOf("plain")).toBeUndefined();
  });
});
