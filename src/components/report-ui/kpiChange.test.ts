import { describe, expect, it } from "vitest";
import { kpiChange } from "./kpiChange";

describe("kpiChange", () => {
  it("is the change as a fraction, with the card's good direction", () => {
    expect(kpiChange(120, 100, "up")).toEqual({
      value: expect.closeTo(0.2),
      goodWhen: "up",
    });
    expect(kpiChange(80, 100, "down")).toEqual({
      value: expect.closeTo(-0.2),
      goodWhen: "down",
    });
  });

  it("has no change without a previous value or from zero", () => {
    expect(kpiChange(10, undefined, "up")).toBeUndefined();
    expect(kpiChange(10, null, "up")).toBeUndefined();
    expect(kpiChange(10, 0, "up")).toBeUndefined();
    expect(kpiChange(null, 5, "up")).toBeUndefined();
  });
});
