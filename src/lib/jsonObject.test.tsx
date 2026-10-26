import { describe, expect, it } from "vitest";
import { asJsonObject } from "./jsonObject";

describe("asJsonObject", () => {
  it("returns plain objects as-is", () => {
    const value = { final_output: "done" };
    expect(asJsonObject(value)).toBe(value);
  });

  it("returns null for arrays, primitives, null and undefined", () => {
    expect(asJsonObject([1, 2])).toBeNull();
    expect(asJsonObject("text")).toBeNull();
    expect(asJsonObject(3)).toBeNull();
    expect(asJsonObject(null)).toBeNull();
    expect(asJsonObject(undefined)).toBeNull();
  });
});
