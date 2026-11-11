import { describe, expect, it } from "vitest";
import { getVal } from "./snapshotValues";
describe("getVal", () => {
  it("returns the first non-null number or string", () => {
    const snap = { a: null, b: "120", c: 5 };
    expect(getVal(snap, "a", "b", "c")).toBe("120");
    expect(getVal(snap, "c")).toBe(5);
    expect(getVal(snap, "missing")).toBeUndefined();
    expect(getVal({ obj: { n: 1 } }, "obj", "c")).toBeUndefined();
  });
});
